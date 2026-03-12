# BuenaVista AI Chat Widget Platform

A white-label AI chat widget platform that allows clients to embed a chat interface on their websites, powered by Anthropic's Claude API.

## Architecture Overview

```
Client Website
  └── Loads widget.js from S3 (via optional CloudFront)
      └── POST requests to API Gateway
          └── Lambda Proxy Function
              ├── Validates clientId in DynamoDB
              ├── Checks origin against allowedOrigins
              ├── Fetches Anthropic API key from Secrets Manager
              └── Proxies request to Anthropic API
```

## Project Structure

```
BV_AI/
├── lambda/
│   └── index.mjs                 # Lambda proxy function (Node.js 20, ESM)
├── widget/
│   └── widget.js                 # Embeddable chat widget (vanilla JS)
├── infra/
│   └── buenavista_aws_setup.sh   # Complete AWS infrastructure setup
├── dynamodb/
│   ├── seed.json                 # Batch example client records
│   └── client-row.json           # Single client row template
├── docs/
│   └── (additional documentation)
├── package.json                  # Node.js dependencies
├── .gitignore
└── README.md
```

## Quick Start

### Prerequisites

- AWS CLI configured with credentials (run `aws configure`)
- Node.js 20+ (for Lambda packaging)
- Anthropic API key

### 1. Automated Setup (Recommended)

```bash
cd /Users/d.madera/Desktop/Programs/BV_AI

# Make the setup script executable
chmod +x infra/buenavista_aws_setup.sh

# Run the setup script
./infra/buenavista_aws_setup.sh
```

The script will prompt you for your Anthropic API key and automatically:
- Create IAM role with minimal permissions
- Set up DynamoDB table
- Store API key in Secrets Manager
- Create Lambda function
- Configure API Gateway
- Set up S3 bucket and upload widget.js

### 2. Add a Client

After setup, add a client to DynamoDB:

```bash
aws dynamodb put-item \
  --table-name buenavista-clients \
  --item file://dynamodb/client-row.json \
  --region us-east-1
```

Edit `dynamodb/client-row.json` to customize:
- `clientId`: Unique identifier (e.g., `acme-corp-001`)
- `systemPrompt`: Instructions for the AI
- `allowedOrigins`: Comma-separated list of approved domains
- `monthlyTokenLimit`: Max tokens allowed per month
- `escalationEmail`: Contact for error alerts
- `model` (optional): Override default model (defaults to `claude-3-haiku-20240307`)

### 3. Embed Widget on Your Site

After setup, you'll receive the widget URL. Add to your website:

```html
<script src="https://buenavista-widget.s3.us-east-1.amazonaws.com/widget.js"></script>
<script>
  BuenaVistaWidget.init({
    clientId: 'your-client-id',
    apiUrl: 'https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/chat',
    position: 'bottom-right' // or 'bottom-left'
  });
</script>
```

## Lambda Function

**File:** `lambda/index.mjs`

### Environment Variables
- `DYNAMODB_TABLE` - DynamoDB table name (default: `buenavista-clients`)
- `SECRET_NAME` - Secrets Manager secret name (default: `buenavista/anthropic-api-key`)

### Behavior
1. Validates HTTP method and CORS origin
2. Looks up `clientId` in DynamoDB
3. Checks that request origin is in `allowedOrigins`
4. Fetches Anthropic API key from Secrets Manager (cached on warm invocations)
5. Proxies request to Anthropic API with client's `systemPrompt`
6. Returns response with CORS headers

### Error Responses
- `400` - Invalid request (missing clientId, invalid JSON, etc.)
- `403` - Unknown clientId or unauthorized origin
- `405` - Invalid HTTP method
- `500` - Server error (DynamoDB, Secrets Manager, or Anthropic API failure)

## Widget (Frontend)

**File:** `widget/widget.js`

### Features
- **Vanilla JavaScript** - No frameworks or build step
- **Full CORS support** - Works from any origin in allowedOrigins
- **Responsive design** - Works on desktop and mobile
- **Typing indicator** - Shows when waiting for response
- **Persistent chat history** - Maintains conversation during session
- **Customizable styling** - Easily modify colors and positioning

### Usage

```html
<script src="https://your-cdn.com/widget.js"></script>
<script>
  BuenaVistaWidget.init({
    clientId: 'your-client-id',
    apiUrl: 'https://your-api-endpoint.com/chat',
    position: 'bottom-right' // 'bottom-left' or 'bottom-right'
  });
</script>
```

### API
- `BuenaVistaWidget.init(options)` - Initialize with config
- `BuenaVistaWidget.open()` - Open chat window
- `BuenaVistaWidget.close()` - Close chat window
- `BuenaVistaWidget.toggle()` - Toggle open/closed state

## Deployment

### Deploy Lambda Function

```bash
# Package and upload
zip -j /tmp/function.zip lambda/index.mjs && \
aws lambda update-function-code \
  --function-name buenavista-chat-proxy \
  --zip-file fileb:///tmp/function.zip \
  --region us-east-1

# Or use npm script
npm run deploy:lambda
```

### Deploy Widget.js

```bash
# Upload to S3
aws s3 cp widget/widget.js s3://buenavista-widget/widget.js \
  --content-type application/javascript \
  --acl public-read

# Or use npm script
npm run upload:widget
```

### Invalidate CloudFront Cache (if using CloudFront)

```bash
# Set distribution ID
export CF_DISTRIBUTION_ID="your-distribution-id"

# Invalidate cache
aws cloudfront create-invalidation \
  --distribution-id "$CF_DISTRIBUTION_ID" \
  --paths "/widget.js"

# Or use npm script
npm run invalidate:cloudfront
```

## Testing

### Test API Endpoint

```bash
curl -X POST https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/prod/chat \
  -H "Content-Type: application/json" \
  -H "Origin: https://yourdomain.com" \
  -d '{
    "clientId": "acme-corp-001",
    "messages": [
      {
        "role": "user",
        "content": "Hello, who are you?"
      }
    ]
  }'
```

### View Lambda Logs

```bash
# Stream logs in real-time
aws logs tail /aws/lambda/buenavista-chat-proxy --follow --region us-east-1

# Or use npm script
npm run logs
```

### Check DynamoDB Data

```bash
# Get a client record
aws dynamodb get-item \
  --table-name buenavista-clients \
  --key '{"clientId":{"S":"acme-corp-001"}}' \
  --region us-east-1

# List all clients
aws dynamodb scan \
  --table-name buenavista-clients \
  --region us-east-1
```

## DynamoDB Client Schema

Every client row in `buenavista-clients` must have:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clientId` | String (Partition Key) | ✓ | Unique client identifier |
| `systemPrompt` | String | ✓ | System prompt sent to Anthropic |
| `allowedOrigins` | String | ✓ | Comma-separated allowed domains |
| `monthlyTokenLimit` | Number | ✓ | Max tokens per month |
| `escalationEmail` | String | ✓ | Alert email for errors/limits |
| `model` | String | - | Override default model (optional) |

### Example Client Row

```json
{
  "clientId": { "S": "acme-corp-001" },
  "systemPrompt": { "S": "You are a helpful support agent for ACME Corp." },
  "allowedOrigins": { "S": "https://acme.com,https://www.acme.com" },
  "monthlyTokenLimit": { "N": "500000" },
  "escalationEmail": { "S": "support@acme.com" },
  "model": { "S": "claude-3-sonnet-20240229" }
}
```

## Security Considerations

### Never Violate These Rules

1. **Never hardcode secrets** - Always use Secrets Manager
2. **Never log sensitive data** - API keys, client credentials, request bodies should never appear in logs
3. **Always validate origins** - Reject requests from unknown origins with 403
4. **Always validate clientId** - Reject unknown clients with 403
5. **Never expose Lambda URL** - Route all traffic through API Gateway
6. **Never commit .env files** - Use environment variables via Lambda configuration

### IAM Permissions

The Lambda execution role has minimal permissions:
- `dynamodb:GetItem` on `buenavista-clients` table only
- `secretsmanager:GetSecretValue` on `buenavista/anthropic-api-key` secret only
- CloudWatch Logs write permissions (standard Lambda execution)

### API Gateway Security

- All requests validated through API Gateway
- CORS headers returned on all responses
- No hardcoded API keys in code or environment variables

## Scaling

### Token Limits

Monitor token usage via `monthlyTokenLimit` in DynamoDB. If a client exceeds their limit:
1. Lambda should reject requests with 429 (Too Many Requests)
2. Alert escalation email contact
3. Require manual intervention to increase limit

### Warm Starts

Lambda caches the Anthropic API key in module scope for warm invocations, reducing Secrets Manager calls and improving response time.

## Troubleshooting

### Lambda Won't Deploy

```bash
# Check permissions
aws iam get-role --role-name buenavista-lambda-role

# Verify Lambda function exists
aws lambda get-function --function-name buenavista-chat-proxy --region us-east-1
```

### Widget Not Loading

1. Verify S3 bucket is public and CORS is configured
2. Check browser console for CORS errors
3. Verify origin is in `allowedOrigins` for your client

### API Returns 403

- **Unknown clientId:** Verify clientId exists in DynamoDB
- **Unauthorized origin:** Check `allowedOrigins` in client config, compare with request origin

### API Returns 500

Check CloudWatch logs for details:
```bash
aws logs get-log-events \
  --log-group-name /aws/lambda/buenavista-chat-proxy \
  --log-stream-name 'LATEST' \
  --region us-east-1
```

## Deployment Checklist

Before deploying any changes:

- [ ] No secrets hardcoded in code
- [ ] CORS headers present on all response paths
- [ ] Origin validation is not bypassed
- [ ] Unknown clientId returns 403, not 500
- [ ] Widget.js has no build step and runs in any browser
- [ ] No `require()` in Lambda (ESM only)
- [ ] Tested locally with curl
- [ ] CloudWatch logs reviewed after first invoke
- [ ] .env files added to .gitignore

## Code Style Guidelines

### Lambda (Node.js 20, ESM)

```javascript
// ✓ Correct
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
const key = await secretsClient.send(command);
const result = await fetch(url);

// ✗ Wrong
const SM = require('aws-sdk/client-secrets-manager');
secretsClient.send(command).then(/* ... */);
require('node-fetch');
```

### Widget (Vanilla JS)

```javascript
// ✓ Correct
const element = document.getElementById('widget');
const config = { clientId: 'demo' };

// ✗ Wrong
import React from 'react';
require('lodash');
const config = var; // avoid var
```

## Support & Documentation

- **Architecture docs:** See ARCHITECTURE.md
- **AWS setup details:** See infra/buenavista_aws_setup.sh comments
- **Lambda API reference:** See lambda/index.mjs JSDoc comments
- **Widget API reference:** See widget/widget.js JSDoc comments

## License

MIT
