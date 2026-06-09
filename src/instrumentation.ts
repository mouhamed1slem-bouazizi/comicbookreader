export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.info("[comic-reader] Server started");
  }
}
