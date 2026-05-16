module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17201b",
        leaf: "#2f7d46",
        limewash: "#eff8e8",
        saffron: "#f5a524",
        night: "#101714"
      },
      boxShadow: {
        soft: "0 16px 40px rgba(23, 32, 27, 0.10)"
      }
    }
  },
  plugins: []
};
