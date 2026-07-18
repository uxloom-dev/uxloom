# UXLoom MCP server (stdio). Build from source for version accuracy.
#   docker build -t uxloom .
#   docker run -i --rm -v "$PWD:/workspace" -w /workspace uxloom
FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY packages ./packages
RUN npm ci && npx tsc --build

# The design file lives in the mounted workspace by default.
ENV UXLOOM_PROJECT=/workspace/uxloom.project.json

ENTRYPOINT ["node", "/app/packages/mcp-server/dist/cli.js"]
