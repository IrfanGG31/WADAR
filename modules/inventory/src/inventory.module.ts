import { Module, type DynamicModule } from "@nestjs/common";
import { StockController } from "./http/stock.controller.js";

@Module({})
export class InventoryModule {
  static forRoot(): DynamicModule {
    return { module: InventoryModule, controllers: [StockController] };
  }
}
