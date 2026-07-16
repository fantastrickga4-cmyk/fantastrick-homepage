import { defineConfig } from "vitest/config";

// 입금 자동매칭(파서·매처) 검증용. bank-auto 에서 그대로 가져온 테스트를 여기서도 돌린다.
// 돈이 걸린 로직이라 테스트 없이 옮기지 않는다.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
