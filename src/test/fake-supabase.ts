/**
 * Minimal recording stand-in for a supabase-js client in unit tests: every
 * `from(table)` chain is recorded as [method, ...args] and resolves to what
 * `respond` returns for it (default `{ data: null, error: null }`).
 */
export type Call = [string, ...unknown[]];
export interface Chain {
  table: string;
  calls: Call[];
}

type Response = { data: unknown; error: unknown };

export function fakeSupabase(
  respond: (chain: Chain) => Response = () => ({ data: null, error: null }),
  respondRpc: (fn: string, args: unknown) => Response = () => ({ data: null, error: null }),
) {
  const chains: Chain[] = [];
  const rpcs: { fn: string; args: unknown }[] = [];
  const builder = (chain: Chain): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
              try {
                resolve(respond(chain));
              } catch (e) {
                reject(e);
              }
            };
          }
          return (...args: unknown[]) => {
            chain.calls.push([prop, ...args]);
            return builder(chain);
          };
        },
      },
    );
  const client = {
    from(table: string) {
      const chain: Chain = { table, calls: [] };
      chains.push(chain);
      return builder(chain);
    },
    async rpc(fn: string, args?: unknown) {
      rpcs.push({ fn, args });
      return respondRpc(fn, args);
    },
  };
  return { client, chains, rpcs };
}

export const has = (chain: Chain, method: string, ...args: unknown[]) =>
  chain.calls.some(([m, ...a]) => m === method && args.every((x, i) => Object.is(a[i], x) || JSON.stringify(a[i]) === JSON.stringify(x)));
