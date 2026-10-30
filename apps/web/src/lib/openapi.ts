// OpenAPI 3.1 description of the public API (served at /api/v1/openapi.json).

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: object) => ({ 'application/json': { schema } });
const error = (description: string) => ({ description, content: json(ref('Error')) });
const id = (name: string) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
});
const errors = {
  '401': error('Missing, invalid, revoked or expired key'),
  '403': error('API disabled on this site, or the key lacks the scope'),
  '429': error('Rate limit (120 requests/minute per key; run limits per user)'),
};

export function openApiDocument(serverUrl: string, version: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'RentAgent API',
      version,
      description:
        'Use the agents of this site from your own systems. Runs are billed to the key owner like runs in the web app. Keys are created under My account › API keys.',
    },
    servers: [{ url: `${serverUrl}/api/v1` }],
    security: [{ bearer: [] }],
    paths: {
      '/agents': {
        get: {
          summary: 'List agents this key may use',
          parameters: [{ name: 'locale', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Agents',
              content: json({
                type: 'object',
                properties: { data: { type: 'array', items: ref('Agent') } },
              }),
            },
            ...errors,
          },
        },
      },
      '/conversations': {
        get: {
          summary: 'List conversations, newest first',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
            {
              name: 'before',
              in: 'query',
              description: 'Cursor: the `next` value of the previous page',
              schema: { type: 'string', format: 'date-time' },
            },
          ],
          responses: {
            '200': {
              description: 'A page of conversations',
              content: json({
                type: 'object',
                properties: {
                  data: { type: 'array', items: ref('ConversationSummary') },
                  next: { type: ['string', 'null'] },
                },
              }),
            },
            ...errors,
          },
        },
        post: {
          summary: 'Start a conversation; the first turn runs immediately',
          requestBody: {
            required: true,
            content: json({
              type: 'object',
              required: ['agent'],
              additionalProperties: false,
              properties: {
                agent: { type: 'string', description: 'Agent slug or id' },
                input: {
                  type: 'object',
                  additionalProperties: { type: ['string', 'number'] },
                  description: "Values for the agent's input fields, by key",
                },
                locale: { type: 'string', description: 'Answer language, e.g. "he"' },
              },
            }),
          },
          responses: {
            '201': { description: 'Created', content: json(ref('Conversation')) },
            '400': error('Malformed JSON body'),
            '402': error('Not enough credits'),
            '404': error('Unknown agent, or not allowed for this key'),
            '422': error('Input fields failed validation (see error.fields)'),
            ...errors,
          },
        },
      },
      '/conversations/{id}': {
        parameters: [id('id')],
        get: {
          summary: 'A conversation with all turns',
          responses: {
            '200': { description: 'Conversation', content: json(ref('Conversation')) },
            '404': error('Not found'),
            ...errors,
          },
        },
        delete: {
          summary: 'Delete a conversation (active turns are stopped)',
          responses: { '204': { description: 'Deleted' }, '404': error('Not found'), ...errors },
        },
      },
      '/conversations/{id}/messages': {
        parameters: [id('id')],
        post: {
          summary: 'Send a follow-up message (a new turn)',
          requestBody: {
            required: true,
            content: json({
              type: 'object',
              required: ['message'],
              additionalProperties: false,
              properties: {
                message: { type: 'string', maxLength: 8000 },
                locale: { type: 'string' },
              },
            }),
          },
          responses: {
            '201': { description: 'The new turn', content: json(ref('Run')) },
            '402': error('Not enough credits'),
            '404': error('Not found'),
            '409': error('A turn is still running, or follow-ups are disabled'),
            '422': error('Empty or too long message'),
            ...errors,
          },
        },
      },
      '/runs/{id}': {
        parameters: [id('id')],
        get: {
          summary: 'One turn',
          responses: {
            '200': { description: 'Turn', content: json(ref('Run')) },
            '404': error('Not found'),
            ...errors,
          },
        },
      },
      '/runs/{id}/events': {
        parameters: [id('id')],
        get: {
          summary: 'Live updates (Server-Sent Events)',
          description:
            'Default events carry a full Run object on every change; `event: partial` carries `{ "text": … }` with the answer so far. The stream ends when the run finishes.',
          responses: {
            '200': { description: 'Event stream', content: { 'text/event-stream': {} } },
            '404': error('Not found'),
            ...errors,
          },
        },
      },
      '/runs/{id}/cancel': {
        parameters: [id('id')],
        post: {
          summary: 'Stop an active turn (unused credits are released)',
          responses: {
            '200': { description: 'Turn', content: json(ref('Run')) },
            '404': error('Not found'),
            '409': error('Already finished'),
            ...errors,
          },
        },
      },
      '/approvals/{id}': {
        parameters: [id('id')],
        post: {
          summary: 'Approve or reject an action the agent wants to take',
          requestBody: {
            required: true,
            content: json({
              type: 'object',
              required: ['approve'],
              additionalProperties: false,
              properties: { approve: { type: 'boolean' } },
            }),
          },
          responses: {
            '200': { description: 'The turn after the decision', content: json(ref('Run')) },
            '404': error('Not found'),
            '409': error('Already decided'),
            ...errors,
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', description: 'ra_sk_… key' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                fields: { type: 'object', additionalProperties: { type: 'string' } },
              },
            },
          },
        },
        Agent: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            slug: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            category: { type: 'string' },
            followUps: { type: 'boolean' },
            inputFields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                  type: { enum: ['text', 'textarea', 'url', 'email', 'number', 'select'] },
                  required: { type: 'boolean' },
                  options: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            price: {
              type: ['object', 'null'],
              description: 'null when free or billing is off; amounts in minor units',
              properties: {
                mode: { enum: ['usage', 'per_task'] },
                amountMinor: { type: 'string' },
                currency: { type: 'string' },
              },
            },
          },
        },
        AgentRef: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            slug: { type: 'string' },
            name: { type: 'string' },
          },
        },
        ConversationSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            source: { enum: ['web', 'api'] },
            agent: ref('AgentRef'),
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Conversation: {
          allOf: [
            ref('ConversationSummary'),
            {
              type: 'object',
              properties: { turns: { type: 'array', items: ref('Run') } },
            },
          ],
        },
        Run: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            conversationId: { type: 'string', format: 'uuid' },
            status: {
              enum: ['QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELED'],
            },
            message: {
              type: ['string', 'null'],
              description: 'Follow-up text (null on the first turn)',
            },
            input: { type: ['object', 'null'], description: 'Input fields of the first turn' },
            output: { type: ['string', 'null'] },
            error: { type: ['string', 'null'] },
            tools: {
              type: 'array',
              items: {
                type: 'object',
                properties: { name: { type: 'string' }, ok: { type: ['boolean', 'null'] } },
              },
            },
            approvals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  tool: { type: 'string' },
                  input: {},
                  status: { enum: ['PENDING', 'APPROVED', 'REJECTED'] },
                },
              },
            },
            chargedMinor: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            finishedAt: { type: ['string', 'null'], format: 'date-time' },
          },
        },
      },
    },
  };
}
