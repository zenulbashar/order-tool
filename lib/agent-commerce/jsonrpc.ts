/**
 * A minimal, dependency-free MCP server core over JSON-RPC 2.0 — the subset
 * the Streamable HTTP transport needs for a STATELESS server: initialize,
 * ping, tools/list, tools/call, and the notifications a client sends. Kept
 * pure (no HTTP, no I/O) so the dispatcher is unit-tested with a fake tool
 * registry; app/api/mcp/route.ts is the thin HTTP shell.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type ToolRegistry = {
  list(): ToolDefinition[];
  call(name: string, args: Record<string, unknown>): Promise<ToolResult | null>;
};

export const JSONRPC_PARSE_ERROR = -32700;
export const JSONRPC_INVALID_REQUEST = -32600;
export const JSONRPC_METHOD_NOT_FOUND = -32601;
export const JSONRPC_INVALID_PARAMS = -32602;
export const JSONRPC_INTERNAL_ERROR = -32603;

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.jsonrpc === "2.0" && typeof v.method === "string";
}

function error(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

/**
 * Handle one request. Returns null for notifications (no id) — the transport
 * answers those with an empty 202. Tool failures are reported the MCP way, as
 * a successful call whose result has isError: true, so the model can read the
 * reason and try again; only protocol failures are JSON-RPC errors.
 */
export async function handleJsonRpc(
  request: JsonRpcRequest,
  tools: ToolRegistry,
  serverInfo: { name: string; version: string },
): Promise<JsonRpcResponse | null> {
  const isNotification = request.id === undefined;
  const id = request.id ?? null;
  if (request.method.startsWith("notifications/")) return null;
  if (isNotification) return null;

  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo,
          instructions:
            "Read-only venue, menu and hours tools for Prompt2Eat storefronts, plus start_order, " +
            "which validates a basket and returns a checkout link the diner completes themselves. " +
            "This server never takes payment and never places an order on the diner's behalf.",
        },
      };
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: tools.list() } };
    case "tools/call": {
      const params = (request.params ?? {}) as { name?: unknown; arguments?: unknown };
      if (typeof params.name !== "string") {
        return error(id, JSONRPC_INVALID_PARAMS, "tools/call requires a tool name.");
      }
      const args =
        params.arguments && typeof params.arguments === "object"
          ? (params.arguments as Record<string, unknown>)
          : {};
      let result: ToolResult | null;
      try {
        result = await tools.call(params.name, args);
      } catch (cause) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text:
                  cause instanceof Error && cause.message
                    ? cause.message
                    : "The tool failed unexpectedly.",
              },
            ],
            isError: true,
          } satisfies ToolResult,
        };
      }
      if (result === null) {
        return error(id, JSONRPC_INVALID_PARAMS, `Unknown tool: ${params.name}`);
      }
      return { jsonrpc: "2.0", id, result };
    }
    default:
      return error(id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${request.method}`);
  }
}
