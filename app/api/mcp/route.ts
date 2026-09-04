import { headers } from "next/headers";

import { agentCommerceTools } from "@/lib/agent-commerce/tools";
import {
  handleJsonRpc,
  isJsonRpcRequest,
  JSONRPC_INVALID_REQUEST,
  JSONRPC_PARSE_ERROR,
  MCP_PROTOCOL_VERSION,
  type JsonRpcResponse,
} from "@/lib/agent-commerce/jsonrpc";
import { checkRateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Agent commerce: a Model Context Protocol server (Streamable HTTP transport,
 * stateless) that lets an external AI agent read a venue's public menu, hours
 * and FAQs and hand a diner a ready-to-pay basket link. Public and
 * unauthenticated by design — it exposes only what the public storefront
 * already shows — and it never takes payment or places an order: start_order
 * returns a storefront URL and the diner pays on the normal checkout.
 * Rate-limited per IP (mcpIp) like the other anonymous surfaces.
 */

const SERVER_INFO = { name: "prompt2eat", version: "1.0.0" };

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "mcp-protocol-version",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      ...CORS_HEADERS,
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Stateless server: no server-initiated stream to open. */
export async function GET(): Promise<Response> {
  return new Response(
    "This MCP server is stateless: POST JSON-RPC 2.0 requests here (initialize, tools/list, tools/call).",
    { status: 405, headers: { allow: "POST, OPTIONS", ...CORS_HEADERS } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const ip = clientIpFromHeaders(await headers());
  const limit = await checkRateLimit("mcpIp", ip);
  if (!limit.success) {
    return json(
      { jsonrpc: "2.0", id: null, error: { code: -32000, message: "Rate limited. Try again shortly." } },
      429,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json(
      { jsonrpc: "2.0", id: null, error: { code: JSONRPC_PARSE_ERROR, message: "Body must be JSON." } },
      400,
    );
  }

  const batch = Array.isArray(payload) ? payload : [payload];
  if (batch.length === 0 || batch.length > 20) {
    return json(
      { jsonrpc: "2.0", id: null, error: { code: JSONRPC_INVALID_REQUEST, message: "Empty or oversized batch." } },
      400,
    );
  }

  const responses: JsonRpcResponse[] = [];
  for (const entry of batch) {
    if (!isJsonRpcRequest(entry)) {
      responses.push({
        jsonrpc: "2.0",
        id: null,
        error: { code: JSONRPC_INVALID_REQUEST, message: "Not a JSON-RPC 2.0 request." },
      });
      continue;
    }
    const response = await handleJsonRpc(entry, agentCommerceTools, SERVER_INFO);
    if (response) responses.push(response);
  }

  // Notifications only: acknowledged with no body, per the transport.
  if (responses.length === 0) {
    return new Response(null, {
      status: 202,
      headers: { "mcp-protocol-version": MCP_PROTOCOL_VERSION, ...CORS_HEADERS },
    });
  }
  return json(Array.isArray(payload) ? responses : responses[0]);
}
