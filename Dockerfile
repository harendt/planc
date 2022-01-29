# Frontend build image.
FROM node:16 AS frontend_build
# Add user and group.
USER node:node
# Copy package info.
ADD --chown=node:node web/package.json web/package-lock.json /work/
# Set working directory.
WORKDIR /work
# Install dependencies.
RUN npm install
# Copy sources.
ADD --chown=node:node web /work
# Build frontend.
ARG configuration=production
RUN npm run build -- --configuration $configuration

# Backend build image.
FROM rust AS backend_build
# Install musl toolchain.
RUN rustup target add x86_64-unknown-linux-musl
# Add unprivileged user.
RUN groupadd user && useradd -m -g user user
# Copy package info.
ADD --chown=user:user Cargo.lock Cargo.toml /work/
# Build backend dependencies only (see: https://stackoverflow.com/a/57971620).
# This requires to create a dummy main.rs file that's deleted afterwards.
USER user:user
WORKDIR /work
RUN mkdir -p /work/src && echo "fn main() { println!(\"Hello World!\"); }" > /work/src/main.rs
RUN cargo build --target x86_64-unknown-linux-musl --release
RUN rm -rf /work/src
# Copy sources and touch main.rs to ensure that it's newer than the dummy file
# created above.
ADD --chown=user:user src /work/src/
RUN touch /work/src/main.rs
# Copy frontend build.
COPY --from=frontend_build --chown=user:user /work/dist /work/web/dist
# Build backend
RUN cargo build --target x86_64-unknown-linux-musl --release

# Runtime image.
FROM alpine
# Copy application.
COPY --from=backend_build /work/target/x86_64-unknown-linux-musl/release/planc /
# Run as unprivileged user.
RUN adduser -D user
USER user:user
# Set entrypoint to run application.
ENV RUST_LOG=info
EXPOSE 8080/tcp
ENTRYPOINT /planc --bind-address 0.0.0.0 --bind-port 8080
