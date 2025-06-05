# nodejs-shell
~/bash/rm%20-r%20logs?admin=passwd&re=1

基于nodejs

1可以反代面板，2可以自定义自己的脚本，3可以上传文件，4可以在url中传入bash指令

需要定义的变量有:

`ADMIN_PASSWORD` 使用/bash/命令时需要传入密码参数?admin=passwd

`UPLOAD_PASSWORD` 使用/file/路径时，上传文件的密码

`FILES_LIST_URL` 给一个下载文件路径，每行一个，在index启动时会自动下载文件

