export function tsQuery(input:string){return input.split(/\s+/).filter(Boolean).join(' & ')}
