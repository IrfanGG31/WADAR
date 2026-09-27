import { Module, type DynamicModule } from "@nestjs/common";
import { InsightsController } from "./http/insights.controller.js";

@Module({})
export class InsightsModule {
  static forRoot(): DynamicModule {
    return { module: InsightsModule, controllers: [InsightsController] };
  }
}
