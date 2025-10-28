import { Body, Controller, Post, Put, Delete, Get, Query } from "@nestjs/common";
import { OpenaiService } from "./agents.service";
import * as models from "src/models";

@Controller("openai")
export class OpenaiController {
  constructor(private readonly openaiService: OpenaiService) {}

  @Post("assistant")
  createAssistant(@Query("apiKey") apiKey: string, @Body() payload: models.Int_OpenAI_Assistant) {
    return this.openaiService.createAssistant(apiKey, payload);
  }

  @Put("assistant")
  updateAssistant(@Query() query: models.Int_Get_OpenAI_Assistant, @Body() payload: models.Int_OpenAI_Assistant) {
    return this.openaiService.updateAssistant(query, payload);
  }

  @Get("assistant")
  getAssistant(@Query() query: models.Int_Get_OpenAI_Assistant) {
    return this.openaiService.getAssistant(query);
  }

  @Post("function")
  addFunction(@Query() query: models.Int_Get_OpenAI_Assistant, @Body() fnDef: models.FunctionDefinition) {
    return this.openaiService.addFunction(query, fnDef);
  }

  @Put("function")
  updateFunction(@Query() query: models.Int_Get_OpenAI_Assistant, @Body() fnDef: models.FunctionDefinition) {
    return this.openaiService.updateFunction(query, fnDef);
  }

  @Delete("function")
  deleteFunction(@Query() query: models.Int_Get_OpenAI_Assistant, @Query("name") fnName: string) {
    return this.openaiService.deleteFunction(query, fnName);
  }

}
