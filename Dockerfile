# 운동앱 동기화 서버 + MCP (앱 자체가 아니라 server/ 만 빌드한다)
# 빌드: docker build -t personal-training-server .
# 실행: docker run -p 8787:8787 -v pt-data:/data personal-training-server

FROM node:22-alpine AS build
WORKDIR /build
# 서버가 쓰는 코드만 복사 (Expo 앱 의존성은 설치하지 않는다)
COPY server ./server
COPY src/domain ./src/domain
COPY src/data ./src/data
RUN npm init -y >/dev/null \
 && npm install --no-audit --no-fund esbuild@0.28 @modelcontextprotocol/server@^2.4.0 zod@^4 \
 && npx esbuild server/http.ts --bundle --platform=node --target=node22 --format=cjs --outfile=dist/server.cjs

FROM node:22-alpine
WORKDIR /app
COPY --from=build /build/dist/server.cjs ./server.cjs
RUN mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production WORKOUT_DATA_DIR=/data PORT=8787 HOST=0.0.0.0
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "server.cjs"]
