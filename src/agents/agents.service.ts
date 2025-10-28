import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import OpenAI from "openai";
import { Int_OpenAI_Assistant, Int_Get_OpenAI_Assistant, FunctionDefinition, FunctionTool } from "src/models";
import { GoogleGenAI } from '@google/genai';
import path from "path";

@Injectable()
export class OpenaiService {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  }
    private readonly ai: GoogleGenAI;
  private getClient(apiKey: string) {
    return new OpenAI({ apiKey });
  }

  //#region Assistant

  async createAssistant(apiKey: string, payload: Int_OpenAI_Assistant) {
    try {
      const openai = this.getClient(apiKey);

      const assistant = await openai.beta.assistants.create({
        name: payload.name,
        instructions: payload.instructions,
        description: payload.description,
        model: payload.model ?? "o3",
      });

      return { assistant };
    } catch (error) {
      console.error(error);
      throw new HttpException(`OpenAI Error: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  async updateAssistant(query: Int_Get_OpenAI_Assistant, payload: Int_OpenAI_Assistant) {
    try {
      const openai = this.getClient(query.apiKey);

      const assistant = await openai.beta.assistants.update(query.assistantId, {
        name: payload.name,
        instructions: payload.instructions,
        description: payload.description,
        model: payload.model ?? "o3",
      });

      return { assistant };
    } catch (error) {
      console.error(error);
      throw new HttpException(`OpenAI Error: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  async getAssistant(query: Int_Get_OpenAI_Assistant) {
    try {
      const openai = this.getClient(query.apiKey);
      const assistant = await openai.beta.assistants.retrieve(query.assistantId);
      return { assistant };
    } catch (error) {
      throw new HttpException(`OpenAI Error: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  //#endregion

  //#region Function Tools

  async addFunction(query: Int_Get_OpenAI_Assistant, fnDef: FunctionDefinition) {
    try {
      const openai = this.getClient(query.apiKey);
      const assistantData = await this.getAssistant(query);
      const fnTool = this.getFormattedToolList(fnDef);

      const tools = (assistantData.assistant.tools ?? []).concat(fnTool);

      await openai.beta.assistants.update(query.assistantId, { tools });
      return { tools };
    } catch (error) {
      console.error(error);
      throw new HttpException(`OpenAI Error: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  async updateFunction(query: Int_Get_OpenAI_Assistant, fnDef: FunctionDefinition) {
    try {
      const openai = this.getClient(query.apiKey);
      const assistantData = await this.getAssistant(query);
      const fnTool = this.getFormattedToolList(fnDef);

      const tools = (assistantData.assistant.tools ?? [])
        .filter((tool) => tool.type !== "function" || tool.function?.name !== fnDef.name)
        .concat(fnTool);

      await openai.beta.assistants.update(query.assistantId, { tools });
      return { tools };
    } catch (error) {
      throw new HttpException(`OpenAI Error: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  async deleteFunction(query: Int_Get_OpenAI_Assistant, fnName: string) {
    try {
      const openai = this.getClient(query.apiKey);
      const assistantData = await this.getAssistant(query);

      const tools = (assistantData.assistant.tools ?? []).filter(
        (tool) => tool.type !== "function" || tool.function?.name !== fnName,
      );

      await openai.beta.assistants.update(query.assistantId, { tools });
      return { tools };
    } catch (error) {
      throw new HttpException(`OpenAI Error: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }



  //#endregion

  //#region Helpers
  private getFormattedToolList(fnDef: FunctionDefinition): FunctionTool {
    if (fnDef.parameters?.properties) {
      for (const key in fnDef.parameters.properties) {
        const property = (fnDef.parameters.properties as any)[key];
        switch (property.type) {
          case "enum":
            property.enum = [property.description];
            delete property.description;
            property.type = "string";
            break;
          default:
            break;
        }
      }
    }

    fnDef.strict = true;
    return { type: "function", function: fnDef };
  }



  //#endregion
}
