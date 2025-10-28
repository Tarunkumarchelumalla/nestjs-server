export interface Int_Get_OpenAI_Assistant {
    apiKey: string;
    assistantId: string;
  }
  
  export interface Int_OpenAI_Assistant {
    name: string;
    instructions: string;
    description?: string;
    model?: string;
  }
  
  export interface FunctionDefinition {
    name: string;
    description: string;
    parameters?: {
      type: string;
      properties?: Record<
        string,
        {
          type: string;
          description?: string;
          enum?: string[];
        }
      >;
      required?: string[];
    };
    strict?: boolean;
  }
  
  export interface FunctionTool {
    type: "function";
    function: FunctionDefinition;
  }
  