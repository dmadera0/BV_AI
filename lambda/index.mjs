import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });
const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });

let cachedApiKey = null;

const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'buenavista-clients';
const SECRET_NAME = process.env.SECRET_NAME || 'buenavista/anthropic-api-key';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-3-haiku-20240307';

/**
 * Fetch the Anthropic API key from Secrets Manager
 * Cached in module scope for warm Lambda invocations
 */
async function getApiKey() {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  try {
    const command = new GetSecretValueCommand({ SecretId: SECRET_NAME });
    const response = await secretsClient.send(command);
    const parsed = JSON.parse(response.SecretString);
    console.log('Secret keys available:', Object.keys(parsed));
    console.log('API key prefix:', parsed.ANTHROPIC_API_KEY?.substring(0, 20));
    cachedApiKey = parsed.ANTHROPIC_API_KEY;
    return cachedApiKey;
  } catch (error) {
    console.error(`Failed to retrieve API key from Secrets Manager: ${error.message}`);
    throw new Error('Unable to retrieve API key');
  }
}

/**
 * Fetch client config from DynamoDB by clientId
 */
async function getClientConfig(clientId) {
  try {
    const command = new GetItemCommand({
      TableName: DYNAMODB_TABLE,
      Key: { clientId: { S: clientId } },
    });
    const response = await dynamoClient.send(command);

    if (!response.Item) {
      return null;
    }

    return unmarshall(response.Item);
  } catch (error) {
    console.error(`Failed to retrieve client config from DynamoDB: ${error.message}`);
    throw new Error('Unable to retrieve client configuration');
  }
}

/**
 * Validate that the request origin is in the client's allowedOrigins list
 */
function validateOrigin(origin, allowedOriginsString) {
  if (!origin) {
    return false;
  }

  const allowedOrigins = allowedOriginsString.split(',').map(o => o.trim());
  return allowedOrigins.includes(origin);
}

/**
 * Build CORS headers for the response
 */
function getCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * Build error response with CORS headers
 */
function errorResponse(statusCode, message, origin) {
  return {
    statusCode,
    headers: getCorsHeaders(origin),
    body: JSON.stringify({ error: message }),
  };
}

/**
 * Handle CORS preflight requests
 */
function handleOptions(origin) {
  return {
    statusCode: 200,
    headers: getCorsHeaders(origin),
    body: '',
  };
}

/**
 * Main Lambda handler
 */
export const handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin;
  const httpMethod = event.httpMethod || event.requestContext?.http?.method;

  // Handle preflight requests
  if (httpMethod === 'OPTIONS') {
    return handleOptions(origin);
  }

  // Only POST requests to /chat are supported
  if (httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', origin);
  }

  let body;
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch (error) {
    return errorResponse(400, 'Invalid JSON in request body', origin);
  }

  const { clientId, messages } = body;

  // Validate clientId is provided
  if (!clientId) {
    return errorResponse(400, 'Missing clientId', origin);
  }

  // Validate messages is provided
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return errorResponse(400, 'Missing or invalid messages array', origin);
  }

  let clientConfig;
  try {
    clientConfig = await getClientConfig(clientId);
  } catch (error) {
    return errorResponse(500, 'Failed to retrieve client configuration', origin);
  }

  // Validate clientId exists in DynamoDB
  if (!clientConfig) {
    console.warn(`Unknown clientId: ${clientId}`);
    return errorResponse(403, 'Unknown or unauthorized client', origin);
  }

  // Validate origin against allowedOrigins
  if (!validateOrigin(origin, clientConfig.allowedOrigins)) {
    console.warn(`Unauthorized origin "${origin}" for clientId: ${clientId}`);
    return errorResponse(403, 'Unauthorized origin', origin);
  }

  // Get the API key
  let apiKey;
  try {
    apiKey = await getApiKey();
  } catch (error) {
    return errorResponse(500, 'Failed to retrieve API key', origin);
  }

  // Determine model (use override from client config or default)
  const model = clientConfig.model || DEFAULT_MODEL;

  // Build the request to Anthropic API
  const anthropicRequest = {
    model,
    max_tokens: 1024,
    system: clientConfig.systemPrompt,
    messages,
  };

  // Call Anthropic API
  let anthropicResponse;
  try {
    const fetchResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicRequest),
    });

    if (!fetchResponse.ok) {
      const errorBody = await fetchResponse.text();
      console.error(`Anthropic API error: ${fetchResponse.status} ${errorBody}`);
      return errorResponse(500, 'Error calling Anthropic API', origin);
    }

    anthropicResponse = await fetchResponse.json();
  } catch (error) {
    console.error(`Failed to call Anthropic API: ${error.message}`);
    return errorResponse(500, 'Error calling Anthropic API', origin);
  }

  // Return the Anthropic response to the client
  return {
    statusCode: 200,
    headers: getCorsHeaders(origin),
    body: JSON.stringify(anthropicResponse),
  };
};
