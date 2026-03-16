#!/bin/bash

# BuenaVista AWS Infrastructure Setup Script
# Creates all necessary AWS resources for the chat proxy platform
# 
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - jq installed for JSON parsing
#   - Permission to create IAM roles, Lambda, DynamoDB, Secrets Manager, S3, CloudFront, API Gateway

set -e

echo "=========================================="
echo "BuenaVista AI - AWS Infrastructure Setup"
echo "=========================================="
echo ""

# Configuration
REGION="us-east-1"
LAMBDA_ROLE_NAME="buenavista-lambda-role"
LAMBDA_FUNCTION_NAME="buenavista-chat-proxy"
DYNAMODB_TABLE="buenavista-clients"
SECRET_NAME="buenavista/anthropic-api-key"
S3_BUCKET="buenavista-widget"
API_GATEWAY_NAME="buenavista-chat-api"
LAMBDA_TIMEOUT=30

echo "Region: $REGION"
echo "Lambda Function: $LAMBDA_FUNCTION_NAME"
echo "DynamoDB Table: $DYNAMODB_TABLE"
echo "Secret: $SECRET_NAME"
echo "S3 Bucket: $S3_BUCKET"
echo ""

# Step 1: Create IAM Role for Lambda
echo "Step 1: Creating IAM role for Lambda..."
TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
)

AWS_ROLE=$(aws iam create-role \
  --role-name "$LAMBDA_ROLE_NAME" \
  --assume-role-policy-document "$TRUST_POLICY" \
  --region "$REGION" 2>/dev/null || echo "Role already exists")

ROLE_ARN=$(aws iam get-role --role-name "$LAMBDA_ROLE_NAME" --query 'Role.Arn' --output text)
echo "✓ IAM Role created/exists: $ROLE_ARN"
echo ""

# Step 2: Create and attach inline policy for DynamoDB and Secrets Manager access
echo "Step 2: Attaching permissions policy to IAM role..."
POLICY_DOC=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:$REGION:*:table/$DYNAMODB_TABLE"
    },
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:$REGION:*:secret:$SECRET_NAME*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:$REGION:*:log-group:/aws/lambda/$LAMBDA_FUNCTION_NAME:*"
    }
  ]
}
EOF
)

aws iam put-role-policy \
  --role-name "$LAMBDA_ROLE_NAME" \
  --policy-name "buenavista-policy" \
  --policy-document "$POLICY_DOC" \
  --region "$REGION"

echo "✓ Policy attached to role"
echo ""

# Step 3: Create DynamoDB table
echo "Step 3: Creating DynamoDB table..."
aws dynamodb create-table \
  --table-name "$DYNAMODB_TABLE" \
  --attribute-definitions AttributeName=clientId,AttributeType=S \
  --key-schema AttributeName=clientId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION" 2>/dev/null || echo "Table already exists"

# Wait for table to be active
echo "Waiting for table to become active..."
aws dynamodb wait table-exists \
  --table-name "$DYNAMODB_TABLE" \
  --region "$REGION"

echo "✓ DynamoDB table ready"
echo ""

# Step 4: Create Secrets Manager secret for API key
echo "Step 4: Creating Secrets Manager secret..."
read -p "Enter your Anthropic API key: " -s ANTHROPIC_API_KEY
echo ""

aws secretsmanager create-secret \
  --name "$SECRET_NAME" \
  --secret-string "$ANTHROPIC_API_KEY" \
  --region "$REGION" 2>/dev/null || {
  echo "Secret already exists, updating..."
  aws secretsmanager put-secret-value \
    --secret-id "$SECRET_NAME" \
    --secret-string "$ANTHROPIC_API_KEY" \
    --region "$REGION"
}

echo "✓ Secrets Manager secret created/updated"
echo ""

# Step 5: Create Lambda function
echo "Step 5: Creating Lambda function..."

# Check if lambda/index.mjs exists
if [ ! -f "lambda/index.mjs" ]; then
  echo "Error: lambda/index.mjs not found"
  exit 1
fi

# Package Lambda function
cd lambda
zip -j /tmp/buenavista-function.zip index.mjs > /dev/null 2>&1
cd ..

# Create or update Lambda function
LAMBDA_EXISTS=$(aws lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" --region "$REGION" 2>/dev/null || echo "false")

if [ "$LAMBDA_EXISTS" = "false" ]; then
  echo "Creating Lambda function..."
  aws lambda create-function \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --timeout "$LAMBDA_TIMEOUT" \
    --environment "Variables={DYNAMODB_TABLE=$DYNAMODB_TABLE,SECRET_NAME=$SECRET_NAME}" \
    --zip-file fileb:///tmp/buenavista-function.zip \
    --region "$REGION" > /dev/null

  echo "✓ Lambda function created"
  
  # Wait for function to be active
  sleep 2
else
  echo "Lambda function exists, updating code..."
  aws lambda update-function-code \
    --function-name "$LAMBDA_FUNCTION_NAME" \
    --zip-file fileb:///tmp/buenavista-function.zip \
    --region "$REGION" > /dev/null
  
  echo "✓ Lambda function code updated"
fi

LAMBDA_ARN=$(aws lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text)
echo "Lambda ARN: $LAMBDA_ARN"
echo ""

# Step 6: Create API Gateway
echo "Step 6: Creating API Gateway..."

API_ID=$(aws apigateway get-rest-apis \
  --region "$REGION" \
  --query "items[?name=='$API_GATEWAY_NAME'].id" \
  --output text)

if [ -z "$API_ID" ]; then
  echo "Creating API Gateway..."
  API_RESPONSE=$(aws apigateway create-rest-api \
    --name "$API_GATEWAY_NAME" \
    --description "BuenaVista Chat API" \
    --region "$REGION")
  
  API_ID=$(echo "$API_RESPONSE" | jq -r '.id')
  sleep 1
else
  echo "API Gateway already exists"
fi

echo "API ID: $API_ID"

# Get the root resource ID
ROOT_RESOURCE_ID=$(aws apigateway get-resources \
  --rest-api-id "$API_ID" \
  --region "$REGION" \
  --query 'items[0].id' \
  --output text)

# Create /chat resource
CHAT_RESOURCE=$(aws apigateway create-resource \
  --rest-api-id "$API_ID" \
  --parent-id "$ROOT_RESOURCE_ID" \
  --path-part chat \
  --region "$REGION" 2>/dev/null || aws apigateway get-resources \
  --rest-api-id "$API_ID" \
  --region "$REGION" \
  --query "items[?path=='/chat'].id" \
  --output text)

CHAT_RESOURCE_ID=$(echo "$CHAT_RESOURCE" | jq -r '.id // .' 2>/dev/null)

# Create POST method
aws apigateway put-method \
  --rest-api-id "$API_ID" \
  --resource-id "$CHAT_RESOURCE_ID" \
  --http-method POST \
  --authorization-type NONE \
  --region "$REGION" 2>/dev/null || echo "POST method already exists"

# Create OPTIONS method for CORS preflight
aws apigateway put-method \
  --rest-api-id "$API_ID" \
  --resource-id "$CHAT_RESOURCE_ID" \
  --http-method OPTIONS \
  --authorization-type NONE \
  --region "$REGION" 2>/dev/null || echo "OPTIONS method already exists"

# Set up Lambda integration for POST
aws apigateway put-integration \
  --rest-api-id "$API_ID" \
  --resource-id "$CHAT_RESOURCE_ID" \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:$REGION:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" \
  --region "$REGION" 2>/dev/null || echo "POST integration already exists"

# Grant API Gateway permission to invoke Lambda
aws lambda add-permission \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --statement-id "ApiGatewayInvoke" \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:$REGION:*:$API_ID/*" \
  --region "$REGION" 2>/dev/null || echo "Lambda permission already exists"

echo "✓ API Gateway configured"
echo ""

# Step 7: Deploy API
echo "Step 7: Deploying API Gateway..."

STAGE_NAME="prod"
DEPLOYMENT=$(aws apigateway create-deployment \
  --rest-api-id "$API_ID" \
  --region "$REGION" \
  --query 'id' \
  --output text)

sleep 1

aws apigateway create-stage \
  --rest-api-id "$API_ID" \
  --deployment-id "$DEPLOYMENT" \
  --stage-name "$STAGE_NAME" \
  --region "$REGION" 2>/dev/null || echo "Stage already exists"

API_ENDPOINT="https://$API_ID.execute-api.$REGION.amazonaws.com/$STAGE_NAME/chat"
echo "✓ API deployed"
echo "Invoke URL: $API_ENDPOINT"
echo ""

# Step 8: Create S3 bucket for widget
echo "Step 8: Creating S3 bucket for widget..."

aws s3 mb "s3://$S3_BUCKET" --region "$REGION" 2>/dev/null || echo "S3 bucket already exists"

# Enable public read access
aws s3api put-bucket-acl \
  --bucket "$S3_BUCKET" \
  --acl public-read \
  --region "$REGION" 2>/dev/null || true

# Enable CORS for widget
CORS_CONFIG=$(cat <<EOF
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
EOF
)

aws s3api put-bucket-cors \
  --bucket "$S3_BUCKET" \
  --cors-configuration "$CORS_CONFIG" \
  --region "$REGION" 2>/dev/null || true

echo "✓ S3 bucket created/configured"
echo ""

# Step 9: Upload widget.js to S3
echo "Step 9: Uploading widget.js to S3..."

if [ -f "widget/widget.js" ]; then
  aws s3 cp "widget/widget.js" "s3://$S3_BUCKET/widget.js" \
    --content-type "application/javascript" \
    --acl public-read \
    --region "$REGION"
  echo "✓ widget.js uploaded"
else
  echo "⚠ widget/widget.js not found, skipping upload"
fi
echo ""

# Summary
echo "=========================================="
echo "✓ Setup Complete!"
echo "=========================================="
echo ""
echo "API Endpoint: $API_ENDPOINT"
echo "S3 Bucket: $S3_BUCKET"
echo "S3 Widget URL: https://$S3_BUCKET.s3.$REGION.amazonaws.com/widget.js"
echo "DynamoDB Table: $DYNAMODB_TABLE"
echo "Lambda Function: $LAMBDA_FUNCTION_NAME"
echo "Secret: $SECRET_NAME"
echo ""
echo "Next steps:"
echo "1. Test the API:"
echo "   curl -X POST $API_ENDPOINT \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -H 'Origin: https://yourdomain.com' \\"
echo "     -d '{\"clientId\":\"demo-client-001\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'"
echo ""
echo "2. Add clients to DynamoDB using:"
echo "   aws dynamodb put-item --table-name $DYNAMODB_TABLE --item file://dynamodb/client-row.json"
echo ""
echo "3. Host widget on CloudFront (optional) or include directly in your website:"
echo "   <script src=\"https://$S3_BUCKET.s3.$REGION.amazonaws.com/widget.js\"></script>"
echo ""
