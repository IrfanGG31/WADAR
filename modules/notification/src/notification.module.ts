import { Module, type DynamicModule } from "@nestjs/common";
import { StreamController } from "./http/stream.controller.js";

@Module({})
export class NotificationModule {
  static forRoot(): DynamicModule {
    return { module: NotificationModule, controllers: [StreamController] };
  }
}
