FROM busybox AS unpack
WORKDIR unpack
COPY server/dist/guppyflo_x86_64.zip /
RUN unzip /guppyflo_x86_64.zip


FROM alpine:latest
COPY --from=unpack /unpack/ /guppyflo/
RUN ln -sf /dev/stdout /guppyflo/guppyflo.log
RUN mkdir -p /guppyflo/config

EXPOSE 9873

WORKDIR /guppyflo

CMD ["/guppyflo/guppyflo", "-c", "./config"]
