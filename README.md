# niten

## MCP

Este proyecto incluye un archivo `.mcp.json` (scope de proyecto) que registra el servidor MCP de Mailerfind vía transporte HTTP. Claude Code lo detecta automáticamente al abrir el repositorio y pedirá aprobación la primera vez.

Equivalente por CLI:

```bash
claude mcp add --transport http mailerfind --scope project https://mcp.mailerfind.com/mcp
```

Para instalarlo solo en tu máquina (disponible en todos tus proyectos), usa `--scope user` en su lugar.
