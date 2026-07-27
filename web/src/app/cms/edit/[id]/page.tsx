import { redirect, notFound } from "next/navigation";
import { isCmsAuthenticated } from "@/lib/cms-auth";
import ArticleEditor from "./ArticleEditor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isCmsAuthenticated())) redirect("/cms/login");
  const { id } = await params;
  if (!id) notFound();
  return <ArticleEditor id={id} />;
}
