import { Suspense } from "react";
import ThanksContent from "./ThanksContent";

export default function ThanksPage() {
  return (
    <Suspense>
      <ThanksContent />
    </Suspense>
  );
}
