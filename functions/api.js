export async function onRequest(context) {
    const data = {
        message: "hello",
        time: new Date().toISOString()
    };

    return Response.json(data);
}