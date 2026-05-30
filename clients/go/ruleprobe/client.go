// Package ruleprobe provides a thin HTTP client for ruleprobe-ai's HTTP API.
package ruleprobe

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

const DefaultBaseURL = "http://localhost:3000"

// Client is an HTTP client for a running `ruleprobe serve` instance.
type Client struct {
	BaseURL    string
	HTTPClient *http.Client
}

// New creates a Client pointing at baseURL (default: http://localhost:3000).
func New(baseURL string) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	return &Client{
		BaseURL:    baseURL,
		HTTPClient: &http.Client{Timeout: 60 * time.Second},
	}
}

// Rules calls GET /ruleprobe/rules and returns the extracted rules for dir.
func (c *Client) Rules(dir string) ([]map[string]any, error) {
	u := fmt.Sprintf("%s/ruleprobe/rules?dir=%s", c.BaseURL, url.QueryEscape(dir))
	resp, err := c.HTTPClient.Get(u)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var out []map[string]any
	return out, json.Unmarshal(body, &out)
}

// Run calls POST /ruleprobe/run and returns evaluation results.
func (c *Client) Run(dir, provider string) ([]map[string]any, error) {
	payload, _ := json.Marshal(map[string]string{"dir": dir, "provider": provider})
	resp, err := c.HTTPClient.Post(
		c.BaseURL+"/ruleprobe/run",
		"application/json",
		bytes.NewReader(payload),
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var out []map[string]any
	return out, json.Unmarshal(body, &out)
}

// Score runs compliance tests and returns the overall score (0-100).
func (c *Client) Score(dir, provider string) (int, error) {
	results, err := c.Run(dir, provider)
	if err != nil {
		return 0, err
	}
	var sum, count float64
	for _, r := range results {
		if r["status"] == "SKIPPED" {
			continue
		}
		if s, ok := r["score"].(float64); ok {
			sum += s
			count++
		}
	}
	if count == 0 {
		return 0, nil
	}
	return int(sum / count), nil
}
