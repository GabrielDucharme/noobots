# CLAUDE.md - Noobots Project Guide

## Commands
- `npm run dev`: Start Next.js development server
- `npm run build`: Build the application
- `npm run start`: Start production server
- `npm run lint`: Run ESLint
- `npm run server`: Start WebSocket server

## Code Style
- **Formatting**: 2-space indentation, single quotes, semicolons
- **Imports**: ES modules, React hooks imported individually
- **Components**: Functional with hooks, 'use client' directive when needed
- **Naming**: PascalCase for components, camelCase for functions/variables, usePrefix for hooks
- **Error Handling**: Try/catch blocks, console.error for logging

## Architecture
- Next.js frontend with WebSocket communication
- Custom hooks for stateful logic (useWebSocket)
- Debug panel toggled with Ctrl+D for development
- Components in app/components, hooks in app/hooks

## Best Practices
- Clean up event listeners and connections on unmount
- Include detailed error messages in status updates
- Use JSDoc comments for type documentation
- Implement reconnection logic for WebSocket connections