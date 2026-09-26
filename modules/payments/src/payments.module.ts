import { Module, type DynamicModule } from "@nestjs/common";
import { PaymentsController } from "./http/payments.controller.js";
import { PAYMENT_PROVIDER, PAYMENTS_OPTIONS, type PaymentsModuleOptions } from "./http/tokens.js";
import { XenditWebhookController } from "./http/xendit-webhook.controller.js";
import { createPaymentProvider } from "./infra/create-provider.js";

@Module({})
export class PaymentsModule {
  static forRoot(options: PaymentsModuleOptions): DynamicModule {
    return {
      module: PaymentsModule,
      controllers: [PaymentsController, XenditWebhookController],
      providers: [
        { provide: PAYMENTS_OPTIONS, useValue: options },
        { provide: PAYMENT_PROVIDER, useValue: createPaymentProvider(options) },
      ],
    };
  }
}
