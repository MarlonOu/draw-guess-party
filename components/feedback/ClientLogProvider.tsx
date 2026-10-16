'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { installClientLog, pushLog } from '../../lib/client/clientLog';

/** 掛在根 layout：安裝全站操作紀錄收集器，並記錄每一次換頁 */
export function ClientLogProvider() {
  const pathname = usePathname();

  useEffect(() => {
    installClientLog();
  }, []);

  useEffect(() => {
    pushLog('nav', pathname);
  }, [pathname]);

  return null;
}
