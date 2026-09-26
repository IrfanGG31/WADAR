import { Module, type DynamicModule } from "@nestjs/common";
import { registerWriteIsolationCase, type Tx } from "@wadar/platform";
import { uuidv7 } from "uuidv7";
import { OrdersController } from "./http/orders.controller.js";
import { SALES_OPTIONS, type SalesModuleOptions } from "./http/tokens.js";
import { insertOrder } from "./infra/orders.repository.js";

let registered = false;

async function orderFixture(tx: Tx, tenantAId: string): Promise<{ id: string }> {
  const orderId = uuidv7();
  await insertOrder(
    tx,
    {
      id: orderId,
      tenantId: tenantAId,
      outletId: uuidv7(),
      orderNumber: `FX-${orderId.slice(-6)}`,
      channel: "pos",
      idempotencyKey: orderId,
      gross: 1000,
      discount: 0,
      net: 1000,
      cost: 500,
      commission: 0,
      completedAt: new Date(),
      createdBy: "fixture",
    },
    [
      {
        id: uuidv7(),
        tenantId: tenantAId,
        orderId,
        variantId: uuidv7(),
        productId: uuidv7(),
        name: "Rahasia Tenant A",
        qty: 1,
        unitPrice: 1000,
        lineDiscount: 0,
        discount: 0,
        netAmount: 1000,
        unitCost: 500,
        commission: 0,
      },
    ],
    [],
  );
  return { id: orderId };
}

@Module({})
export class SalesModule {
  static forRoot(options: SalesModuleOptions): DynamicModule {
    if (!registered) {
      registered = true;
      registerWriteIsolationCase({
        module: "sales",
        method: "POST",
        path: (id) => `/v1/orders/${id}/void`,
        body: { reason: "dibajak tenant lain" },
        createFixture: orderFixture,
      });
    }
    return {
      module: SalesModule,
      controllers: [OrdersController],
      providers: [{ provide: SALES_OPTIONS, useValue: options }],
    };
  }
}
