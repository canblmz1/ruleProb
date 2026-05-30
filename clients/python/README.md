# ruleprobe-client (Python)

Thin HTTP wrapper for [`ruleprobe-ai`](https://www.npmjs.com/package/ruleprobe-ai)'s built-in HTTP server.

## Setup

```bash
# Start the server in your project directory
npx ruleprobe-ai serve --port 3000

# Install the Python client
pip install ruleprobe-client
```

## Usage

```python
from ruleprobe_client import RuleProbeClient

client = RuleProbeClient("http://localhost:3000")

# Get extracted rules
rules = client.rules(".")
print(f"{len(rules)} rules found")

# Run compliance tests
results = client.run(".", provider="mock")
score = client.score(".")
print(f"Score: {score}/100")
```
