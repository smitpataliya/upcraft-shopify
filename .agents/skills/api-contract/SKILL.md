---
name: api-contract
description: Defines the API contract (endpoints, request and response DTOs, status codes, errors, speed and load limits) before frontend and backend code is written. Use when a feature needs a new or changed endpoint, or when frontend and backend must agree on data shapes.
---

# API contract

## Steps
1. Find the project and the module's work plan in `<project-root>\docs\plans\`
   (see the implementation-plan skill for naming; legacy: `<workspace-root>\work plans\`).
   Use the chosen approach and the speed targets from the plan.
2. Read existing controllers and DTOs so naming and style match the project rules (api-design, spring-layers, java-naming-structure).
3. For each endpoint define: method and path (versioned, /api/v1/...), request DTO with validation,
   response DTO, success status code, error cases with status codes and error codes.
   List endpoints must be paginated.
4. For each endpoint also define the speed and load contract (see performance-scalability rule):
   - target p95 response time and maximum payload size
   - pagination: default and maximum page size, sort fields allowed (each must be indexed)
   - caching: cacheable or not, Cache-Control / ETag, TTL
   - slow operations (over about 1-2 seconds): 202 Accepted plus a status endpoint
   - POST that creates data or moves money: idempotency key header
   - rate limit class (normal, expensive, public) and the 429 response
5. Write the contract into the "API Endpoints" section of the module's work plan.
6. Ask for approval before implementing either side.

## Rules
- Never expose entities or internal fields.
- Keep it short: one table per endpoint is enough.
- Never allow an unbounded list, an unbounded filter or sorting on a column without an index.
