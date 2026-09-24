import type { FastifyInstance, FastifyReply } from "fastify";

export type BroadcastFn = (event: string, sourceId?: string) => void;

export function createEventBroadcaster() {
  const sseClients = new Map<FastifyReply, string | undefined>();

  const broadcast: BroadcastFn = (event, sourceId) => {
    for (const [client, clientSourceId] of sseClients) {
      if (sourceId !== undefined && sourceId === clientSourceId) continue;
      client.raw.write(`event: ${event}\ndata: {}\n\n`);
    }
  };

  const registerEventRoutes = (app: FastifyInstance) => {
    app.get<{ Querystring: { sourceId?: string } }>("/api/events", (req, reply) => {
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      reply.raw.write("\n");
      sseClients.set(reply, req.query.sourceId);
      reply.raw.on("close", () => {
        sseClients.delete(reply);
      });
    });
  };

  return { broadcast, registerEventRoutes };
}
