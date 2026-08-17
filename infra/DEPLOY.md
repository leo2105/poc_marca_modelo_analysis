# Deploy privado en AWS (WSL / Ubuntu)

Hosting: **S3 + CloudFront + Cognito** (login usuario/contraseña). Los buckets no son públicos; CloudFront sirve la app y `/imgs/*`. Lambda@Edge exige cookie JWT de Cognito para sprites y el resto de rutas (salvo assets mínimos de la SPA).

Todos los comandos asumen **bash en WSL/Ubuntu** desde la raíz del repo.

## Requisitos

- WSL2 con Ubuntu (o Linux/macOS)
- AWS CLI v2 autenticado (`aws sts get-caller-identity`)
- Node.js 20+ y npm
- Python 3 (para adjuntar Lambda@Edge a CloudFront)
- `zip` (opcional; si falta, el script usa Python)
- Permisos AWS: CloudFormation, S3, CloudFront, Cognito, IAM, Lambda
- Carpeta local `public/imgs/` con sprites (no va a Git)

### AWS CLI en WSL

```bash
# Instalar (Ubuntu)
sudo apt update && sudo apt install -y awscli zip python3

# Credenciales (una vez)
aws configure
# AWS Access Key ID, Secret, región (ej. us-east-1), output json
```

Si el proyecto está en `/mnt/c/...`, los scripts funcionan igual; para mejor rendimiento con muchos archivos, clona el repo dentro de `~/` en WSL.

## 1. Configurar entorno

```bash
cd ~/poc_marca_modelo_analysis   # o tu ruta en WSL
cp .env.example .env
chmod +x scripts/*.sh
```

Edita `.env`:

```env
AWS_REGION=us-east-1
STACK_NAME=len-validation
PROJECT_NAME=len-validation
COGNITO_DOMAIN_PREFIX=len-validation-tuempresa   # único a nivel mundial
```

En desarrollo local deja Cognito apagado:

```env
VITE_COGNITO_ENABLED=false
```

Si ves `set: pipefail: invalid option name`, los scripts tienen finales de línea Windows. Corrige con:

```bash
sed -i 's/\r$//' scripts/*.sh
# o: sudo apt install dos2unix && dos2unix scripts/*.sh
```

Si aparece `libtinfo.so.6: no version information`, usa el bash del sistema (los scripts npm ya invocan `/bin/bash`) o ejecuta `conda deactivate` antes del deploy.

## 2. Primer deploy

```bash
./scripts/deploy.sh
# o
npm run deploy
```

Esto:

1. Crea el stack CloudFormation (Cognito, S3 app, S3 imgs, CloudFront OAC)
2. Registra callbacks `https://dxxxx.cloudfront.net` en Cognito
3. Genera `.env.production` y hace `npm run build`
4. Sube `dist/` al bucket app (sin `imgs/`)
5. Sincroniza `public/imgs/` → bucket imgs
6. Adjunta Lambda@Edge (viewer-request) y invalida CloudFront

La propagación de CloudFront / Lambda@Edge puede tardar **5–15 minutos**.

## 3. Invitar compañeros

```bash
./scripts/invite-user.sh ana@empresa.com
# contraseña temporal opcional como 2º argumento:
./scripts/invite-user.sh ana@empresa.com 'TempPass-2026!'
```

Reciben email con contraseña temporal y la cambian en el primer login (Hosted UI).

## 4. Actualizar solo imágenes

```bash
./scripts/sync-imgs.sh
# o
npm run sync:imgs
```

## 5. Actualizar solo la app (código)

```bash
SKIP_INFRA=true ATTACH_EDGE=false ./scripts/deploy.sh
# o
npm run deploy:app
```

## 6. Solo re-adjuntar Lambda@Edge

```bash
./scripts/attach-auth-edge.sh
```

## Arquitectura

```
Usuario → CloudFront (HTTPS)
            ├─ /          → S3 app (SPA)
            ├─ /assets/*  → S3 app
            └─ /imgs/*    → S3 imgs
         Lambda@Edge valida cookie len_id_token (JWT Cognito)
         SPA AuthGate → Cognito Hosted UI (PKCE)
```

## Archivos clave

| Path | Rol |
|------|-----|
| `infra/cloudformation.yml` | Cognito + S3 + CloudFront |
| `infra/auth-at-edge/` | Lambda@Edge JWT gate |
| `scripts/deploy.sh` | Deploy completo |
| `scripts/sync-imgs.sh` | Sync sprites |
| `scripts/invite-user.sh` | Crear usuarios |
| `scripts/attach-auth-edge.sh` | Lambda@Edge en CloudFront |
| `src/auth/` | Login SPA + cookie para el edge |

## Notas

- Cada navegador guarda validaciones en `localStorage` (no hay sync entre compañeros todavía).
- No subas `node_modules` ni `public/imgs/` a Git.
- Si cambias de región Cognito, vuelve a ejecutar `./scripts/attach-auth-edge.sh`.
- Los scripts `.ps1` existen por compatibilidad con Windows nativo; el flujo recomendado es WSL/bash.
