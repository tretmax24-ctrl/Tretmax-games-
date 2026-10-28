import type { ReactNode } from 'react'

export function DemoNotice({ children }: { children: ReactNode }) { return <p className="demo-notice"><span aria-hidden="true">i</span>{children}</p> }
