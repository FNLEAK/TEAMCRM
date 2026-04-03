"use client";

import { useCallback, useState } from "react";

export function useBoardRefresh() {
  const [boardVersion, setBoardVersion] = useState(0);
  const refresh = useCallback(() => setBoardVersion((v) => v + 1), []);
  return { boardVersion, refresh };
}
