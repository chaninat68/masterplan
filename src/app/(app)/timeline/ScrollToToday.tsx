"use client";

import { useEffect } from "react";

/** เลื่อนตาราง Timeline ให้เห็นวันนี้ (เว้นช่องซ้ายไว้ ~1 สัปดาห์) */
export function ScrollToToday() {
  useEffect(() => {
    const wrap = document.getElementById("tl-wrap");
    const th = wrap?.querySelector<HTMLElement>("th[data-today]");
    if (!wrap || !th) return;
    const sticky = wrap.querySelector<HTMLElement>("th.tl-c5");
    const left = sticky ? sticky.offsetLeft + sticky.offsetWidth : 0;
    wrap.scrollLeft = Math.max(0, th.offsetLeft - left - th.offsetWidth * 7);
  }, []);
  return null;
}
