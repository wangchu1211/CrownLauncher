[CmdletBinding()]
param(
    [switch]$Verify
)

$ErrorActionPreference = "Stop"

$resourceRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$outputRoot = $resourceRoot
$temporaryRoot = $null
if ($Verify)
{
    $temporaryRoot = Join-Path $env:TEMP ("crown-launcher-icon-" + [Guid]::NewGuid().ToString("N"))
    $outputRoot = $temporaryRoot
    New-Item -ItemType Directory -Path $outputRoot | Out-Null
}

Add-Type -AssemblyName System.Drawing

$source = @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public static class CrownLauncherIconGenerator
{
    private const float DesignSize = 512.0f;

    private static GraphicsPath RoundedRect(
        float x,
        float y,
        float width,
        float height,
        float radius)
    {
        var path = new GraphicsPath();
        var diameter = radius * 2.0f;
        path.AddArc(x, y, diameter, diameter, 180, 90);
        path.AddArc(x + width - diameter, y, diameter, diameter, 270, 90);
        path.AddArc(x + width - diameter, y + height - diameter, diameter, diameter, 0, 90);
        path.AddArc(x, y + height - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static Bitmap Render(int size)
    {
        var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.Clear(Color.Transparent);
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            graphics.CompositingQuality = CompositingQuality.HighQuality;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.ScaleTransform(size / DesignSize, size / DesignSize);

            using (var tile = RoundedRect(8, 8, 496, 496, 92))
            using (var background = new LinearGradientBrush(
                new PointF(32, 24),
                new PointF(480, 496),
                Color.FromArgb(47, 46, 47),
                Color.FromArgb(27, 27, 28)))
            using (var border = new Pen(Color.FromArgb(70, 69, 70), 2.0f))
            {
                graphics.FillPath(background, tile);
                graphics.DrawPath(border, tile);
            }

            using (var crownBrush = new LinearGradientBrush(
                new PointF(0, 112),
                new PointF(0, 390),
                Color.FromArgb(255, 158, 31),
                Color.FromArgb(255, 130, 20)))
            using (var crownPen = new Pen(crownBrush, 42.0f))
            {
                crownPen.LineJoin = LineJoin.Miter;
                crownPen.MiterLimit = 3.0f;
                crownPen.StartCap = LineCap.Flat;
                crownPen.EndCap = LineCap.Flat;
                graphics.DrawLines(crownPen, new[]
                {
                    new PointF(108, 382),
                    new PointF(77, 176),
                    new PointF(185, 270),
                    new PointF(256, 116),
                    new PointF(327, 270),
                    new PointF(435, 176),
                    new PointF(404, 382),
                });
            }

            using (var projectBrush = new LinearGradientBrush(
                new PointF(0, 266),
                new PointF(0, 402),
                Color.FromArgb(255, 128, 94),
                Color.FromArgb(247, 92, 65)))
            using (var topProject = RoundedRect(222, 270, 68, 58, 11))
            using (var leftProject = RoundedRect(180, 340, 70, 60, 11))
            using (var rightProject = RoundedRect(262, 340, 70, 60, 11))
            {
                graphics.FillPath(projectBrush, topProject);
                graphics.FillPath(projectBrush, leftProject);
                graphics.FillPath(projectBrush, rightProject);
            }
        }
        return bitmap;
    }

    private static byte[] EncodePng(int size)
    {
        using (var bitmap = Render(size))
        using (var stream = new MemoryStream())
        {
            bitmap.Save(stream, ImageFormat.Png);
            return stream.ToArray();
        }
    }

    private static void SaveIco(string path)
    {
        var sizes = new[] { 16, 20, 24, 32, 40, 48, 64, 128, 256 };
        var frames = new List<byte[]>(sizes.Length);
        foreach (var size in sizes)
        {
            frames.Add(EncodePng(size));
        }

        using (var stream = File.Create(path))
        using (var writer = new BinaryWriter(stream))
        {
            writer.Write((ushort)0);
            writer.Write((ushort)1);
            writer.Write((ushort)sizes.Length);

            var offset = 6 + (16 * sizes.Length);
            for (var index = 0; index < sizes.Length; ++index)
            {
                var size = sizes[index];
                writer.Write((byte)(size == 256 ? 0 : size));
                writer.Write((byte)(size == 256 ? 0 : size));
                writer.Write((byte)0);
                writer.Write((byte)0);
                writer.Write((ushort)1);
                writer.Write((ushort)32);
                writer.Write(frames[index].Length);
                writer.Write(offset);
                offset += frames[index].Length;
            }

            foreach (var frame in frames)
            {
                writer.Write(frame);
            }
        }
    }

    public static void Generate(string outputRoot)
    {
        Directory.CreateDirectory(outputRoot);
        using (var bitmap = Render(512))
        {
            bitmap.Save(Path.Combine(outputRoot, "app-icon.png"), ImageFormat.Png);
        }
        SaveIco(Path.Combine(outputRoot, "app-icon.ico"));
    }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies System.Drawing

try
{
    [CrownLauncherIconGenerator]::Generate($outputRoot)

    if ($Verify)
    {
        foreach ($name in @("app-icon.png", "app-icon.ico"))
        {
            $expected = (Get-FileHash (Join-Path $resourceRoot $name) -Algorithm SHA256).Hash
            $actual = (Get-FileHash (Join-Path $outputRoot $name) -Algorithm SHA256).Hash
            if ($expected -ne $actual)
            {
                throw "$name does not match GenerateAppIcon.ps1. Regenerate the committed assets."
            }
        }
        Write-Host "Launcher icon source and generated assets are in sync."
    }
    else
    {
        Write-Host "Generated Launcher app-icon.png and app-icon.ico in $resourceRoot"
    }
}
finally
{
    if ($temporaryRoot -and (Test-Path $temporaryRoot))
    {
        Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
    }
}
