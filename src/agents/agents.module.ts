import { Module } from "@nestjs/common";
import { OpenaiController } from "./agents.controller";
import { OpenaiService } from "./agents.service";

@Module({
  controllers: [OpenaiController],
  providers: [OpenaiService],
})
export class AgentsModule {}