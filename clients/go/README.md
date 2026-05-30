# ruleprobe-go (Go)

Thin HTTP wrapper for [`ruleprobe-ai`](https://www.npmjs.com/package/ruleprobe-ai)'s built-in HTTP server.

## Setup

```bash
# Start the server in your project directory
npx ruleprobe-ai serve --port 3000

# Install the Go client
go get github.com/canblmz1/ruleprobe-go/ruleprobe
```

## Usage

```go
package main

import (
    "fmt"
    "github.com/canblmz1/ruleprobe-go/ruleprobe"
)

func main() {
    client := ruleprobe.New("http://localhost:3000")

    // Get extracted rules
    rules, _ := client.Rules(".")
    fmt.Printf("%d rules found\n", len(rules))

    // Run compliance tests
    score, _ := client.Score(".", "mock")
    fmt.Printf("Score: %d/100\n", score)
}
```
