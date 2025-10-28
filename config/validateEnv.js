export const validateEnv = () => {
  const requiredVars = ["DATABASE_URL", "JWT_SECRET"];
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`❌ Missing environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
};
