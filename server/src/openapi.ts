const err = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

const companyParams = [
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
  { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
];

const listResponses = {
  "200": {
    description: "Matching connections, newest capture first",
    content: { "application/json": { schema: { $ref: "#/components/schemas/ConnectionList" } } },
  },
  "400": err("Missing/invalid company or pagination value"),
};

const jsonBody = (ref: string) => ({
  required: true,
  content: { "application/json": { schema: { $ref: ref } } },
});

const contactBodySchema = (required: string[]) => ({
  type: "object",
  required,
  additionalProperties: true,
  description: "Free-form job/profile info; the listed fields are required non-empty strings.",
  properties: Object.fromEntries(required.map((k) => [k, { type: "string" }])),
});

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Top of the Stack API",
    version: "1.0.0",
    description:
      "Saved LinkedIn connections plus recruiter lookup and email drafting. There is no authentication: the server listens on 127.0.0.1 only.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        responses: {
          "200": {
            description: "Database reachable",
            content: {
              "application/json": {
                schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["ok"] } } },
              },
            },
          },
          "503": err("Database unreachable"),
        },
      },
    },
    "/api/v1/connections": {
      post: {
        summary: "Create or update a connection by normalized profile URL",
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            description: "Retries with the same key replay the original response.",
            schema: { type: "string", maxLength: 255, example: "3f0c6a52-6a0e-4b8e-9d57-0d2c8a1f6b11" },
          },
        ],
        requestBody: jsonBody("#/components/schemas/ConnectionInput"),
        responses: {
          "200": {
            description: "Existing connection updated",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UpsertResult" } } },
          },
          "201": {
            description: "Connection created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/UpsertResult" } } },
          },
          "400": err("Malformed JSON or missing Idempotency-Key"),
          "413": err("Body larger than 100kb"),
          "422": {
            description: "Body failed validation",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } },
          },
        },
      },
      get: {
        summary: "List connections for a company",
        description: "Case-insensitive match on the normalized company name (legal suffixes like Inc/LLC ignored).",
        parameters: [
          { name: "company", in: "query", required: true, schema: { type: "string", example: "Stripe" } },
          ...companyParams,
        ],
        responses: listResponses,
      },
    },
    "/api/v1/companies/{company}/connections": {
      get: {
        summary: "List connections for a company (path form)",
        parameters: [
          { name: "company", in: "path", required: true, schema: { type: "string", example: "Stripe" } },
          ...companyParams,
        ],
        responses: listResponses,
      },
    },
    "/api/v1/connections/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      get: {
        summary: "Get one connection",
        responses: {
          "200": {
            description: "The connection",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Connection" } } },
          },
          "404": err("Not found"),
        },
      },
      delete: {
        summary: "Delete one connection",
        responses: { "204": { description: "Deleted" }, "404": err("Not found") },
      },
    },
    "/api/v1/company-scopes/{company}": {
      parameters: [
        {
          name: "company",
          in: "path",
          required: true,
          description: "URL-decoded and normalized like connection company names, so \"Stripe, Inc.\" and \"stripe\" are the same scope.",
          schema: { type: "string", example: "Stripe" },
        },
      ],
      get: {
        summary: "Get the saved LinkedIn company scope for a company",
        responses: {
          "200": {
            description: "The scope",
            content: { "application/json": { schema: { $ref: "#/components/schemas/CompanyScope" } } },
          },
          "400": err("Blank company"),
          "404": err("No scope saved for this company"),
        },
      },
      put: {
        summary: "Create or replace the LinkedIn company scope for a company",
        requestBody: jsonBody("#/components/schemas/CompanyScopeInput"),
        responses: {
          "200": {
            description: "The saved scope",
            content: { "application/json": { schema: { $ref: "#/components/schemas/CompanyScope" } } },
          },
          "400": err("Blank company or malformed JSON"),
          "413": err("Body larger than 100kb"),
          "422": {
            description: "Body failed validation",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ValidationError" } } },
          },
        },
      },
      delete: {
        summary: "Delete the LinkedIn company scope for a company",
        responses: { "204": { description: "Deleted" }, "400": err("Blank company"), "404": err("Not found") },
      },
    },
    "/api/find-contact": {
      post: {
        summary: "Find a public recruiting/HR email for a company and role (uses Claude + web search)",
        requestBody: jsonBody("#/components/schemas/FindContactInput"),
        responses: {
          "200": {
            description: "A contact, or an empty object if none was found",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Contact" } } },
          },
          "400": err("Invalid body"),
          "413": err("Body larger than 100kb"),
          "502": err("Upstream lookup failed"),
        },
      },
    },
    "/api/draft-email": {
      post: {
        summary: "Draft a cold outreach email (uses Claude)",
        requestBody: jsonBody("#/components/schemas/DraftEmailInput"),
        responses: {
          "200": {
            description: "The drafted email",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Draft" } } },
          },
          "400": err("Invalid body"),
          "413": err("Body larger than 100kb"),
          "502": err("Upstream draft failed"),
        },
      },
    },
  },
  components: {
    schemas: {
      Error: { type: "object", required: ["error"], properties: { error: { type: "string" } } },
      ValidationError: {
        type: "object",
        required: ["error", "details"],
        properties: {
          error: { type: "string" },
          details: {
            type: "array",
            items: {
              type: "object",
              required: ["path", "message"],
              properties: { path: { type: "string" }, message: { type: "string" } },
            },
          },
        },
      },
      ConnectionInput: {
        type: "object",
        required: ["source", "sourceProfileUrl", "name", "capturedAt", "extractorVersion"],
        properties: {
          source: { type: "string", example: "linkedin" },
          sourceProfileUrl: { type: "string", example: "https://www.linkedin.com/in/example-person/" },
          name: { type: "string", example: "Example Person" },
          headline: { type: "string", nullable: true, example: "Software Engineer at Example Company" },
          company: { type: "string", nullable: true, example: "Example Company" },
          location: { type: "string", nullable: true, example: "Provo, Utah, United States" },
          degree: { type: "string", enum: ["1st", "2nd", "3rd"], nullable: true, description: "LinkedIn connection degree. Overwritten on every upsert (omitted = cleared)." },
          notes: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" }, nullable: true },
          mutuals: {
            type: "array",
            maxItems: 5,
            nullable: true,
            items: { $ref: "#/components/schemas/Mutual" },
            description: "Named mutual connections, in on-page order. Replaced on every upsert (omitted = cleared).",
          },
          mutualCount: {
            type: "integer",
            minimum: 0,
            nullable: true,
            description: "Total mutual connections LinkedIn reports, including unnamed ones. Overwritten on every upsert (omitted = cleared).",
          },
          capturedAt: { type: "string", format: "date-time", example: "2026-10-02T00:00:00.000Z" },
          extractorVersion: { type: "string", example: "1.0.0" },
        },
      },
      Mutual: {
        type: "object",
        required: ["name", "profileUrl"],
        properties: {
          name: { type: "string", minLength: 1, maxLength: 200, example: "Sam Mutual" },
          profileUrl: {
            type: "string",
            description: "LinkedIn profile URL; normalized to https://www.linkedin.com/in/<slug>/ on save.",
            example: "https://www.linkedin.com/in/sam-mutual/",
          },
        },
      },
      Connection: {
        type: "object",
        required: [
          "id", "source", "sourceProfileUrl", "name", "headline", "company", "location", "degree", "notes",
          "tags", "mutuals", "mutualCount", "capturedAt", "extractorVersion", "createdAt", "updatedAt",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          source: { type: "string" },
          sourceProfileUrl: { type: "string" },
          name: { type: "string" },
          headline: { type: "string", nullable: true },
          company: { type: "string", nullable: true },
          location: { type: "string", nullable: true },
          degree: { type: "string", enum: ["1st", "2nd", "3rd"], nullable: true },
          notes: { type: "string", nullable: true },
          tags: { type: "array", items: { type: "string" } },
          mutuals: { type: "array", items: { $ref: "#/components/schemas/Mutual" } },
          mutualCount: { type: "integer", minimum: 0, nullable: true },
          capturedAt: { type: "string", format: "date-time" },
          extractorVersion: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      UpsertResult: {
        type: "object",
        required: ["id", "status", "connection"],
        properties: {
          id: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["created", "updated"] },
          connection: { $ref: "#/components/schemas/Connection" },
        },
      },
      ConnectionList: {
        type: "object",
        required: ["data", "pagination"],
        properties: {
          data: { type: "array", items: { $ref: "#/components/schemas/Connection" } },
          pagination: {
            type: "object",
            required: ["limit", "offset", "total"],
            properties: { limit: { type: "integer" }, offset: { type: "integer" }, total: { type: "integer" } },
          },
        },
      },
      CompanyScopeInput: {
        type: "object",
        required: ["linkedinIds"],
        properties: {
          linkedinSlug: { type: "string", nullable: true, example: "stripe" },
          linkedinName: { type: "string", nullable: true, example: "Stripe" },
          linkedinIds: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: { type: "string", pattern: "^\\d{1,15}$" },
            description: "LinkedIn Current-company filter IDs from the company page's employees link.",
            example: ["2135371"],
          },
        },
      },
      CompanyScope: {
        type: "object",
        required: ["company", "linkedinSlug", "linkedinName", "linkedinIds", "resolvedAt"],
        properties: {
          company: { type: "string", example: "Stripe" },
          linkedinSlug: { type: "string", nullable: true },
          linkedinName: { type: "string", nullable: true },
          linkedinIds: { type: "array", items: { type: "string" } },
          resolvedAt: { type: "string", format: "date-time" },
        },
      },
      FindContactInput: contactBodySchema(["company", "role"]),
      DraftEmailInput: contactBodySchema(["company", "role", "email", "label"]),
      Contact: {
        type: "object",
        description: "Empty object when no email was found.",
        properties: { email: { type: "string" }, label: { type: "string" } },
      },
      Draft: {
        type: "object",
        required: ["subject", "body"],
        properties: { subject: { type: "string" }, body: { type: "string" } },
      },
    },
  },
};
