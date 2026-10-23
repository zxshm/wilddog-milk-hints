"""通过标准输入接收密码，在同一进程内完成 SSH 部署；密码不落盘、不写日志。"""
import json
import os
import shlex
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8")
host, user = sys.argv[1:3]
print("等待 SSH 密码", flush=True)
password = sys.stdin.readline().rstrip("\r\n")
client = paramiko.SSHClient()
client.load_host_keys(os.path.expanduser("~/.ssh/known_hosts"))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
client.connect(host, username=user, password=password, look_for_keys=False, allow_agent=False, timeout=20)
print("SSH 已连接", flush=True)
for line in sys.stdin:
    try:
        job = json.loads(line)
        if job["op"] == "exec":
            command = job["command"]
            if job.get("sudo"):
                command = "sudo -S -p '' sh -c " + shlex.quote(command)
            stdin, stdout, stderr = client.exec_command(command, timeout=job.get("timeout", 120))
            if job.get("sudo"):
                stdin.write(password + "\n")
            if "input" in job:
                stdin.write(job["input"])
            stdin.channel.shutdown_write()
            result = {"exit": stdout.channel.recv_exit_status(), "stdout": stdout.read().decode("utf-8", "replace"), "stderr": stderr.read().decode("utf-8", "replace")}
        elif job["op"] == "put":
            with client.open_sftp() as sftp:
                sftp.put(job["local"], job["remote"])
            result = {"uploaded": job["remote"]}
        elif job["op"] == "write":
            with client.open_sftp() as sftp:
                with sftp.file(job["remote"], "w") as handle:
                    handle.write(job["content"])
                sftp.chmod(job["remote"], job.get("mode", 0o600))
            result = {"written": job["remote"]}
        elif job["op"] == "close":
            break
        else:
            raise ValueError("未知操作")
        if not job.get("quiet"):
            print(json.dumps(result, ensure_ascii=False), flush=True)
        else:
            print(json.dumps({"completed": job["op"], "exit": result.get("exit")}), flush=True)
    except Exception as exc:
        print(json.dumps({"error": type(exc).__name__, "message": str(exc)}, ensure_ascii=False), flush=True)
client.close()
