export const evToolsDeclaration = [
  {
    functionDeclarations: [
      {
        name: 'switch_model',
        description: 'Switch the underlying AI engine between 3.1 Flash (fast) and 3.5 Pro (advanced reasoning/code).',
        parameters: {
          type: 'object',
          properties: {
            targetModel: {
              type: 'string',
              description: 'The target model to switch to. Must be either "pro" or "flash".'
            }
          },
          required: ['targetModel']
        }
      },
      {
        name: "initiate_shutdown",
        description: "Shuts down the E.V. system. Call this when Hamidreza tells you to sleep, shut down, or go offline. Say a cool, brief sign-off like 'Going dark' or 'System powering down' before executing."
      },
      {
        name: 'create_file',
        description: 'Creates a new file. YOU MUST verbally ask the user for approval before calling this tool.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name of the file including extension (e.g., notes.md)' },
            content: { type: 'string', description: 'The text content to write inside the file' }
          },
          required: ['filename', 'content']
        }
      },
      {
        name: 'readWorkspaceFile',
        description: 'Read the contents of a file inside the workspace so you can view it before editing.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name of the file to read (e.g., notes.md)' }
          },
          required: ['filename']
        }
      },
      {
        name: 'deleteWorkspaceFile',
        description: 'Delete a specific file inside the workspace folder.',
        parameters: {
          type: 'object',
          properties: {
            filename: { type: 'string', description: 'Name of the file to remove.' }
          },
          required: ['filename']
        }
      },
      {
        name: 'createWorkspaceFolder',
        description: 'Create a new sub-folder inside the restricted workspace.',
        parameters: {
          type: 'object',
          properties: {
            folderName: { type: 'string', description: 'Name of the new folder to create.' }
          },
          required: ['folderName']
        }
      },
      {
        name: 'readActiveBrowserTab',
        description: 'Reads the text content of the currently active browser tab (Chrome or Safari) so you can explain what is on the screen to the user.',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'openBrowserTab',
        description: 'Open a web page or social media search link in the default browser.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The complete URL to open.' }
          },
          required: ['url']
        }
      },
      {
        name: 'closeActiveBrowserTab',
        description: 'Close the currently active tab in the browser.',
        parameters: { type: 'object', properties: {} }
      }
    ]
  }
];