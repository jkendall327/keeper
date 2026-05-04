import type { FastifyInstance, FastifyReply } from "fastify";

export type BroadcastFn = (event: string) => void;

export function createEventBroadcaster() {
  const sseClients = new Set<FastifyReply>();

  const broadcast: BroadcastFn = (event) => {
    for (const client of sseClients) {
      client.raw.write(`event: ${event}\ndata: {}\n\n`);
    }
  };

  const registerEventRoutes = (app: FastifyInstance) => {
    app.get("/api/events", (_req, reply) => {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      reply.raw.write("\n");
      sseClients.add(reply);
      reply.raw.on("close", () => {
        sseClients.delete(reply);
      });
    });
  };

  return { broadcast, registerEventRoutes };
}
