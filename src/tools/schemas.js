export const evToolsDeclaration = [
  {
    functionDeclarations: [
      {
        name: 'switchModel',
        description: 'Switch the underlying AI engine between 3.6 Flash (fast) and 3.1 Pro (advanced reasoning/code).',
        parameters: {
          type: 'OBJECT',
          properties: {
            targetModel: {
              type: 'STRING',
              description: 'The target model to switch to. Must be either "pro" or "flash".'
            }
          },
          required: ['targetModel']
        }
      },
      {
        name: 'writeWorkspaceFile',
        description: 'Write or update a text file inside the restricted workspace folder.',
        parameters: {
          type: 'OBJECT',
          properties: {
            filename: { type: 'STRING', description: 'Name of the file (e.g. notes.txt)' },
            content: { type: 'STRING', description: 'Text content to save.' }
          },
          required: ['filename', 'content']
        }
      },
      {
        name: 'deleteWorkspaceFile',
        description: 'Delete a specific file inside the workspace folder.',
        parameters: {
          type: 'OBJECT',
          properties: {
            filename: { type: 'STRING', description: 'Name of the file to remove.' }
          },
          required: ['filename']
        }
      },
      {
        name: 'openBrowserTab',
        description: 'Open a web page or social media search link in the default browser.',
        parameters: {
          type: 'OBJECT',
          properties: {
            url: { type: 'STRING', description: 'The complete URL to open.' }
          },
          required: ['url']
        }
      },
      {
        name: 'closeActiveBrowserTab',
        description: 'Close the currently active tab in the browser.',
        parameters: { type: 'OBJECT', properties: {} }
      }
    ]
  }
];