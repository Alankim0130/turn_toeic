"use client";

import { useEffect } from "react";
import { markMessagesRead } from "./actions";

/** 알림함이 화면에 뜨면 안 읽은 것을 읽음으로 바꾼다 (한 번) */
export function MarkRead({ unread }: { unread: number }) {
  useEffect(() => {
    if (unread > 0) void markMessagesRead();
  }, [unread]);
  return null;
}
