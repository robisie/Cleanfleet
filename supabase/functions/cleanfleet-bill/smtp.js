export function smtpInput(body){
 const host=String(body.host||'').trim().toLowerCase(),username=String(body.username||'').trim(),password=String(body.password||'');
 if(!/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)||/\.(?:local|internal|localhost)$/.test(host))throw Error('Podaj publiczny adres serwera SMTP, np. mail.twojadomena.pl.');
 if(Number(body.port)!==465)throw Error('Serwer aplikacji obsługuje SMTP SSL na porcie 465.');
 if(!username||username.length>254||/[\r\n\x00]/.test(username)||!password||password.length>1024||/[\r\n\x00]/.test(password))throw Error('Podaj login i hasło do poczty wychodzącej.');
 return {host,port:465,username,password};
}
export async function smtpTransport(config){
 const nodemailer=(await import('npm:nodemailer@^9')).default;
 return nodemailer.createTransport({host:config.host,port:465,secure:true,auth:{user:config.username,pass:config.password},tls:{rejectUnauthorized:true},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000});
}
