import Home from "../../page";

type ChatSessionPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
};

export default async function ChatSessionPage({ params }: ChatSessionPageProps) {
  const { sessionId } = await params;

  return <Home initialSessionId={sessionId} />;
}
