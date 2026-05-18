const DEFAULT_ACCESS_CODE = "0000";

export function requireAccessCode(req, res, next) {
  const expectedCode = process.env.APP_ACCESS_CODE || DEFAULT_ACCESS_CODE;
  const providedCode = req.get("x-access-code") || req.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (providedCode === expectedCode) {
    next();
    return;
  }

  res.status(401).json({ success: false, message: "Access code required" });
}
