# Troubleshooting Guide

Common issues and solutions for MetaSPN Pro production deployment.

## Container Issues

### Containers Not Starting

**Symptoms**: Containers exit immediately or fail to start

**Solutions**:

1. Check logs:
   ```bash
   sudo docker-compose -f docker-compose.prod.yml logs
   ```

2. Check container status:
   ```bash
   sudo docker-compose -f docker-compose.prod.yml ps
   ```

3. Verify environment variables:
   ```bash
   sudo /opt/metaspn/scripts/validate-secrets.sh
   ```

4. Check Docker daemon:
   ```bash
   sudo systemctl status docker
   ```

5. Restart containers:
   ```bash
   sudo docker-compose -f docker-compose.prod.yml restart
   ```

### Container Health Checks Failing

**Symptoms**: Containers show "unhealthy" status

**Solutions**:

1. Check health endpoint manually:
   ```bash
   curl http://localhost:3001/health
   curl http://localhost:3000/
   ```

2. Check container logs:
   ```bash
   sudo docker logs metaspn-backend-prod
   sudo docker logs metaspn-frontend-prod
   ```

3. Verify ports are not conflicting:
   ```bash
   sudo netstat -tuln | grep -E ':(3000|3001|5432)'
   ```

4. Increase health check timeout in docker-compose.prod.yml if services are slow to start

## Database Issues

### Database Connection Failed

**Symptoms**: Backend can't connect to database

**Solutions**:

1. Check database container:
   ```bash
   sudo docker ps | grep postgres
   sudo docker logs metaspn-postgres-prod
   ```

2. Test database connection:
   ```bash
   sudo docker exec metaspn-postgres-prod pg_isready -U metaspn
   ```

3. Verify DATABASE_URL in environment:
   ```bash
   sudo grep DATABASE_URL /etc/metaspn/.env.prod
   ```

4. Check database credentials:
   ```bash
   sudo docker exec -it metaspn-postgres-prod psql -U metaspn -d metaspn
   ```

5. Restart database:
   ```bash
   sudo docker-compose -f docker-compose.prod.yml restart postgres
   ```

### Database Migrations Failing

**Symptoms**: Migrations error or don't apply

**Solutions**:

1. Check migration files:
   ```bash
   ls -la /opt/metaspn/database/migrations/
   ```

2. Run migrations manually:
   ```bash
   sudo docker-compose -f docker-compose.prod.yml exec postgres psql -U metaspn -d metaspn -f /opt/metaspn/database/migrations/<migration-file>.sql
   ```

3. Check migration tracking table:
   ```bash
   sudo docker exec metaspn-postgres-prod psql -U metaspn -d metaspn -c "SELECT * FROM schema_migrations;"
   ```

4. Verify database permissions

## Network Issues

### Services Not Accessible

**Symptoms**: Can't access frontend or backend from browser

**Solutions**:

1. Check if containers are running:
   ```bash
   sudo docker ps
   ```

2. Verify port bindings:
   ```bash
   sudo docker port metaspn-backend-prod
   sudo docker port metaspn-frontend-prod
   ```

3. Check firewall:
   ```bash
   sudo ufw status
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

4. Test local connectivity:
   ```bash
   curl http://localhost:3001/health
   curl http://localhost:3000/
   ```

5. Check Nginx configuration:
   ```bash
   sudo docker logs metaspn-nginx
   sudo nginx -t  # If running natively
   ```

### SSL Certificate Issues

**Symptoms**: SSL errors or certificate expired

**Solutions**:

1. Check certificate expiration:
   ```bash
   sudo certbot certificates
   ```

2. Renew certificate:
   ```bash
   sudo certbot renew
   ```

3. Verify certificate files:
   ```bash
   sudo ls -la /etc/letsencrypt/live/your-domain.com/
   ```

4. Copy certificates to Nginx:
   ```bash
   sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /etc/nginx/ssl/
   sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /etc/nginx/ssl/
   sudo docker restart metaspn-nginx
   ```

## Deployment Issues

### GitHub Actions Deployment Failing

**Symptoms**: Deployment workflow fails

**Solutions**:

1. Check GitHub Actions logs for specific error

2. Verify SSH connection:
   ```bash
   ssh -i <key-file> metaspn@your-server
   ```

3. Check GitHub Secrets are set correctly

4. Verify server has disk space:
   ```bash
   df -h
   ```

5. Check Docker disk usage:
   ```bash
   sudo docker system df
   ```

6. Clean up old images:
   ```bash
   sudo docker image prune -a -f
   ```

### Health Check Failing After Deployment

**Symptoms**: Deployment succeeds but health check fails

**Solutions**:

1. Check service logs immediately:
   ```bash
   sudo docker logs --tail 100 metaspn-backend-prod
   sudo docker logs --tail 100 metaspn-frontend-prod
   ```

2. Verify environment variables are loaded:
   ```bash
   sudo docker exec metaspn-backend-prod env | grep -E '(DATABASE_URL|JWT_SECRET)'
   ```

3. Check if services need more time to start (increase health check start_period)

4. Manual rollback:
   ```bash
   sudo /opt/metaspn/scripts/rollback.sh
   ```

## Performance Issues

### High CPU Usage

**Symptoms**: Server CPU usage > 80%

**Solutions**:

1. Identify resource-intensive containers:
   ```bash
   sudo docker stats
   ```

2. Check for infinite loops or memory leaks in logs

3. Scale down resource limits if over-provisioned

4. Consider scaling horizontally

5. Check for background jobs consuming resources

### High Memory Usage

**Symptoms**: Server running out of memory

**Solutions**:

1. Check memory usage:
   ```bash
   free -h
   sudo docker stats
   ```

2. Reduce container memory limits in docker-compose.prod.yml

3. Check for memory leaks:
   ```bash
   sudo docker logs metaspn-backend-prod | grep -i "memory\|out of memory"
   ```

4. Restart containers to free memory:
   ```bash
   sudo docker-compose -f docker-compose.prod.yml restart
   ```

### Slow Database Queries

**Symptoms**: Application slow, database queries taking long

**Solutions**:

1. Check slow query log:
   ```bash
   sudo docker exec metaspn-postgres-prod cat /var/log/postgresql/postgresql-*.log | grep "duration:"
   ```

2. Analyze database:
   ```bash
   sudo docker exec metaspn-postgres-prod psql -U metaspn -d metaspn -c "ANALYZE;"
   ```

3. Check for missing indexes

4. Optimize PostgreSQL configuration in database/postgresql.conf

5. Consider database connection pooling adjustments

## Log Issues

### No Logs Appearing

**Symptoms**: Can't see application logs

**Solutions**:

1. Check Docker logging driver:
   ```bash
   sudo docker info | grep "Logging Driver"
   ```

2. View container logs:
   ```bash
   sudo docker logs metaspn-backend-prod
   ```

3. Check log rotation configuration:
   ```bash
   cat /etc/logrotate.d/metaspn
   ```

4. Verify log directory permissions:
   ```bash
   ls -la /var/log/metaspn/
   ```

### Logs Filling Disk

**Symptoms**: Disk space full, logs very large

**Solutions**:

1. Check disk usage:
   ```bash
   df -h
   sudo du -sh /var/log/*
   ```

2. Clean up old logs:
   ```bash
   sudo find /var/log -name "*.log" -mtime +7 -delete
   sudo docker system prune -a -f
   ```

3. Adjust log rotation settings in /etc/logrotate.d/metaspn

4. Reduce Docker log retention:
   ```bash
   # Edit /etc/docker/daemon.json
   {
     "log-opts": {
       "max-size": "5m",
       "max-file": "2"
     }
   }
   sudo systemctl restart docker
   ```

## Security Issues

### Fail2ban Blocking Legitimate IPs

**Symptoms**: Can't access server, IP blocked

**Solutions**:

1. Check fail2ban status:
   ```bash
   sudo fail2ban-client status
   sudo fail2ban-client status sshd
   ```

2. Unban IP:
   ```bash
   sudo fail2ban-client set sshd unbanip <your-ip>
   ```

3. Adjust fail2ban configuration in /etc/fail2ban/jail.local

4. Whitelist your IP:
   ```bash
   # Add to /etc/fail2ban/jail.local
   [sshd]
   ignoreip = 127.0.0.1/8 ::1 <your-ip>
   ```

### SSL Certificate Errors

**Symptoms**: Browser shows SSL errors

**Solutions**:

1. Verify certificate is valid:
   ```bash
   openssl s_client -connect your-domain.com:443 -servername your-domain.com
   ```

2. Check certificate chain:
   ```bash
   sudo certbot certificates
   ```

3. Verify Nginx SSL configuration

4. Check certificate files exist and are readable

## Backup and Restore Issues

### Backups Not Running

**Symptoms**: No backup files created

**Solutions**:

1. Check backup container:
   ```bash
   sudo docker ps | grep backup
   sudo docker logs metaspn-db-backup
   ```

2. Verify backup script permissions:
   ```bash
   ls -la /opt/metaspn/scripts/backup-database.sh
   ```

3. Run backup manually:
   ```bash
   sudo /opt/metaspn/scripts/backup-database.sh
   ```

4. Check backup directory exists and is writable:
   ```bash
   sudo ls -la /backups
   ```

### Restore Failing

**Symptoms**: Can't restore from backup

**Solutions**:

1. Verify backup file exists and is readable:
   ```bash
   ls -lh /backups/metaspn_backup_*.sql.gz
   ```

2. Check backup file integrity:
   ```bash
   gunzip -t /backups/metaspn_backup_YYYYMMDD_HHMMSS.sql.gz
   ```

3. Verify database credentials

4. Check database has enough space

5. Restore to a test database first

## Getting Help

If you can't resolve an issue:

1. Check logs: `sudo /opt/metaspn/scripts/view-logs.sh all`
2. Run monitoring: `sudo /opt/metaspn/scripts/monitor.sh`
3. Check GitHub Issues for similar problems
4. Review deployment documentation
5. Check server resources: CPU, memory, disk space

## Emergency Procedures

### Complete System Failure

1. **Stop all services**:
   ```bash
   sudo docker-compose -f docker-compose.prod.yml down
   ```

2. **Check system resources**:
   ```bash
   df -h
   free -h
   top
   ```

3. **Restore from backup** if needed

4. **Restart services**:
   ```bash
   sudo docker-compose -f docker-compose.prod.yml up -d
   ```

### Database Corruption

1. **Stop application**:
   ```bash
   sudo docker-compose -f docker-compose.prod.yml stop backend frontend worker
   ```

2. **Restore from latest backup**:
   ```bash
   sudo /opt/metaspn/scripts/restore-database.sh /backups/latest-backup.sql.gz
   ```

3. **Verify database integrity**:
   ```bash
   sudo docker exec metaspn-postgres-prod psql -U metaspn -d metaspn -c "VACUUM ANALYZE;"
   ```

4. **Restart services**

### Security Breach

1. **Immediately rotate all secrets**:
   ```bash
   sudo /opt/metaspn/scripts/rotate-secrets.sh all
   ```

2. **Review logs for suspicious activity**:
   ```bash
   sudo grep -i "error\|unauthorized\|failed" /var/log/metaspn/*.log
   ```

3. **Check fail2ban logs**:
   ```bash
   sudo tail -f /var/log/fail2ban.log
   ```

4. **Update all packages**:
   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
   ```

5. **Review access logs**:
   ```bash
   sudo docker logs metaspn-nginx | grep -i "suspicious\|attack"
   ```
