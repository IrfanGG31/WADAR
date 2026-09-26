import * as React from "react"

export function FakeChart() {
  return (
    <div className="flex h-[200px] w-full items-end gap-2 text-primary pt-4 pb-2 relative">
      <div className="absolute top-0 left-0 text-[10px] text-muted-foreground flex flex-col justify-between h-full py-2">
        <span>8 jt</span>
        <span>6 jt</span>
        <span>4 jt</span>
        <span>2 jt</span>
        <span>0</span>
      </div>
      <div className="absolute inset-0 left-6 right-2 bottom-6 border-b border-l border-border/50 border-dashed">
         <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
           <path d="M0,80 L15,85 L30,70 L45,65 L60,50 L75,40 L90,10 L100,5" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
           <path d="M0,100 L0,80 L15,85 L30,70 L45,65 L60,50 L75,40 L90,10 L100,5 L100,100 Z" fill="currentColor" fillOpacity="0.1" vectorEffect="non-scaling-stroke"/>
           <circle cx="0" cy="80" r="2" fill="currentColor" />
           <circle cx="15" cy="85" r="2" fill="currentColor" />
           <circle cx="30" cy="70" r="2" fill="currentColor" />
           <circle cx="45" cy="65" r="2" fill="currentColor" />
           <circle cx="60" cy="50" r="2" fill="currentColor" />
           <circle cx="75" cy="40" r="2" fill="currentColor" />
           <circle cx="90" cy="10" r="2" fill="currentColor" />
         </svg>
         <div className="absolute top-[10%] right-[10%] bg-white px-2 py-1 rounded shadow-sm border border-border text-xs font-semibold">
           Rp 5.320.000
         </div>
      </div>
      <div className="absolute bottom-0 left-6 right-2 flex justify-between text-[10px] text-muted-foreground">
        <span>12 Jun</span>
        <span>13 Jun</span>
        <span>14 Jun</span>
        <span>15 Jun</span>
        <span>16 Jun</span>
        <span>17 Jun</span>
        <span>18 Jun</span>
      </div>
    </div>
  )
}
