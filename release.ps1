[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Version,

    [Parameter(Position = 1)]
    [string]$Notes
)

$ErrorActionPreference = 'Stop'

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command $($Arguments -join ' ') failed (exit $LASTEXITCODE)."
    }
}

if ($Version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
    [string]::IsNullOrWhiteSpace($Notes)) {
    throw 'Usage: .\release.ps1 -Version 1.9.4 -Notes "Describe the changes". Both arguments are required; use an x.y.z version without v.'
}

Push-Location $PSScriptRoot
try {
    foreach ($command in @('git', 'node', 'npm')) {
        Get-Command $command -ErrorAction Stop | Out-Null
    }
    $dirty = Invoke-Checked 'git' @('status', '--porcelain', '--untracked-files=no')
    if ($dirty) {
        throw 'Commit tracked changes before releasing. The script commits only version files.'
    }
    $branch = Invoke-Checked 'git' @('symbolic-ref', '--quiet', '--short', 'HEAD')
    Invoke-Checked 'git' @('remote', 'get-url', 'origin') | Out-Null
    $current = (Get-Content 'package.json' -Raw | ConvertFrom-Json).version
    $manifest = Get-Content 'manifest.json' -Raw | ConvertFrom-Json
    if ($current -ne $manifest.version) {
        throw 'package.json and manifest.json versions must match before releasing.'
    }
    if ([version]$Version -le [version]$current) {
        throw "Version $Version must be newer than $current."
    }
    $localTag = Invoke-Checked 'git' @('tag', '--list', $Version)
    $remoteTag = Invoke-Checked 'git' @('ls-remote', '--tags', 'origin', "refs/tags/$Version")
    if ($localTag -or $remoteTag) {
        throw "Tag $Version already exists. Choose a new version."
    }

    Invoke-Checked 'npm' @('version', $Version, '--no-git-tag-version')
    Invoke-Checked 'npm' @('test')
    Invoke-Checked 'npm' @('run', 'build')

    $package = Get-Content 'package.json' -Raw | ConvertFrom-Json
    $manifest = Get-Content 'manifest.json' -Raw | ConvertFrom-Json
    $versions = Get-Content 'versions.json' -Raw | ConvertFrom-Json
    if ($package.version -ne $Version -or $manifest.version -ne $Version -or
        $versions.$Version -ne $manifest.minAppVersion) {
        throw "Version files were not updated consistently (package=$($package.version), manifest=$($manifest.version), compatibility=$($versions.$Version), expected=$Version/$($manifest.minAppVersion)). Nothing has been pushed."
    }

    $files = @('package.json', 'manifest.json', 'versions.json')
    if (Test-Path 'package-lock.json') {
        $files += 'package-lock.json'
    }
    Invoke-Checked 'git' (@('add', '--') + $files)
    Invoke-Checked 'git' @('-c', 'commit.gpgsign=false', 'commit', '-m', "Release $Version")
    Invoke-Checked 'git' @('-c', 'tag.gpgsign=false', 'tag', '-a', $Version, '-m', $Notes, '--cleanup=verbatim')
    Invoke-Checked 'git' @('push', '--atomic', 'origin', "HEAD:refs/heads/$branch", "refs/tags/$Version")
    Write-Host "Pushed $Version. GitHub Actions will test, build, and publish the release with your notes."
}
catch {
    Write-Warning 'Release stopped. Local changes, commits, or tags may remain; inspect git status and git log before retrying. No automatic rollback was performed.'
    throw
}
finally {
    Pop-Location
}
