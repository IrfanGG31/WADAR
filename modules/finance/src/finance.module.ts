import { Module, type DynamicModule } from "@nestjs/common";
import { registerWriteIsolationCase } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { FinanceController } from "./http/finance.controller.js";
import { ensureLedger, insertWallet } from "./infra/ledger.repository.js";

let registered = false;

@Module({})
export class FinanceModule {
  static forRoot(): DynamicModule {
    if (!registered) {
      registered = true;
      registerWriteIsolationCase({
        module: "finance",
        method: "PATCH",
        path: (id) => `/v1/finance/wallets/${id}`,
        body: { name: "Dibajak" },
        createFixture: async (tx, tenantAId) => {
          await ensureLedger(tx, tenantAId);
          return { id: (await insertWallet(tx, tenantAId, `Rahasia ${uuidv7().slice(-4)}`, "bank", null)).id };
        },
      });
      registerWriteIsolationCase({
        module: "finance",
        method: "POST",
        path: (id) => `/v1/finance/wallets/${id}/balance`,
        body: { actualBalance: 1 },
        createFixture: async (tx, tenantAId) => {
          await ensureLedger(tx, tenantAId);
          return { id: (await insertWallet(tx, tenantAId, `Rahasia ${uuidv7().slice(-4)}`, "cash", null)).id };
        },
      });
    }
    return { module: FinanceModule, controllers: [FinanceController] };
  }
}
